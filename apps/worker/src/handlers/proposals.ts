import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as HttpApiBuilder from "effect/unstable/httpapi/HttpApiBuilder";
import type { Experience } from "@job-index/domain/Profile";
import type { Profile } from "@job-index/domain/Profile";
import { Proposal, targetOf } from "@job-index/domain/Proposals";
import { ProposalId } from "@job-index/domain/Ids";
import type { EntitlementRequired } from "@job-index/domain/Failure";
import {
  api,
  CurrentPrincipal,
  InvalidProposalValue,
  ProfileDecisionConflict,
  NotFound,
  ProposalAlreadyDecided,
  UnsupportedDocument,
  UpgradeRequired,
} from "../Api.ts";
import type { ProposalView as ProposalViewSchema } from "../Api.ts";
import { Profiles } from "../services/Accounts.ts";
import { Entitlements } from "../services/Entitlements.ts";
import { Extraction } from "../services/Extraction.ts";
import { HeuristicInference, ModelInference, type ProposalDraft } from "../services/Inference.ts";
import * as ProposalsRepo from "../db/repositories/Proposals.ts";
import { acceptProposal } from "../accounts/profiles.ts";

/** Bounded responses: a CV cannot honestly propose more than this. */
const MAX_PROPOSALS = 64;
const MAX_ACCEPT_ATTEMPTS = 3;

class ProposalDiscardAtomicityDefect extends Error {
  readonly name = "ProposalDiscardAtomicityDefect";

  constructor(readonly affected: number) {
    super(`owner-scoped proposal discard affected ${affected} rows while proposal stayed pending`);
  }
}

const decodeProposalId = Schema.decodeUnknownSync(ProposalId);
const encodeProposedValue = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));

interface PendingRow {
  readonly id: ProposalId;
  readonly sourceKind: "text" | "pdf";
  readonly fieldPath: string;
  readonly proposedValue: unknown;
  readonly evidenceExcerpt: string;
  readonly confidence: "high" | "medium" | "low";
  readonly engine: "heuristic" | "model";
  readonly createdAt: string;
}

const toView = (row: PendingRow): typeof ProposalViewSchema.Type => ({
  id: row.id,
  sourceKind: row.sourceKind,
  fieldPath: row.fieldPath,
  proposedValue: encodeProposedValue(row.proposedValue),
  evidenceExcerpt: row.evidenceExcerpt,
  confidence: row.confidence,
  engine: row.engine,
  status: "pending",
  createdAt: row.createdAt,
});

/**
 * The document→profile loop's server half (WS-0016).
 *
 * Transient by construction (WS-0015 §6 OQ-4): `create` extracts and infers
 * from the request body inside this handler and persists only the
 * conclusions — one structured value plus a short evidence quote per row.
 * Nothing here retains raw document text or bytes. Accept composes the same
 * profile encoding/write contract with the proposal transition in one D1
 * batch; discard touches nothing but the proposal row itself. Entitlement follows the
 * precedent (`handlers/applications.ts`): checked in the handler before the
 * model tag is reached, heuristic tier never gated.
 *
 * `Database` is resolved once per handler and provided explicitly to each
 * repository call (the `handlers/status.ts` pattern): these frozen group
 * handlers promise no context of their own, so the requirement never leaks
 * into the layer's type.
 */
export const layer = HttpApiBuilder.group(api, "proposals", (handlers) =>
  handlers
    .handle("create", ({ payload }) =>
      Effect.gen(function* () {
        const database = yield* Database;
        const ids = yield* Ids;
        const principal = yield* CurrentPrincipal;
        const extraction = yield* Extraction;
        const model = yield* ModelInference;
        const heuristics = yield* HeuristicInference;

        let downgradeReason: string | undefined;
        let effectiveEngine: "heuristic" | "model" = payload.engine ?? "heuristic";
        if (payload.engine === "model") {
          const entitlements = yield* Entitlements;
          yield* entitlements
            .require(principal.profileId, "model-inference")
            .pipe(
              Effect.catchTag("EntitlementRequired", (failure: EntitlementRequired) =>
                Effect.fail(new UpgradeRequired({ capability: failure.capability })),
              ),
            );
        }

        const extracted = yield* Effect.catchTag(
          extraction.extract({ content: payload.content, mimeType: payload.mimeType }),
          "UnsupportedDocument",
          (failure) => Effect.fail(new UnsupportedDocument({ message: failure.reason })),
        );

        let drafts: ReadonlyArray<ProposalDraft>;
        if (payload.engine === "model") {
          const attempted = yield* Effect.result(model.propose(extracted.text));
          if (attempted._tag === "Failure") {
            downgradeReason = attempted.failure.reason;
            effectiveEngine = "heuristic";
            drafts = yield* heuristics.propose(extracted.text);
          } else {
            drafts = attempted.success;
          }
        } else {
          drafts = yield* heuristics.propose(extracted.text);
        }

        const now = yield* DateTime.now;
        const nowIso = DateTime.formatIso(now);
        const rows: Array<PendingRow & { profileId: Proposal["profileId"] }> = [];
        for (const draft of drafts) {
          if (rows.length >= MAX_PROPOSALS) break;
          const target = targetOf(draft.fieldPath);
          if (target === undefined) continue;
          const validated = yield* Effect.result(
            Schema.decodeUnknownEffect(target)(draft.proposedValue),
          );
          if (validated._tag === "Failure") continue;
          rows.push({
            id: decodeProposalId(yield* ids.next),
            profileId: principal.profileId,
            sourceKind: extracted.sourceKind,
            fieldPath: draft.fieldPath,
            proposedValue: validated.success,
            evidenceExcerpt: evidenceOf(draft.evidenceExcerpt),
            confidence: draft.confidence,
            engine: effectiveEngine,
            createdAt: nowIso,
          });
        }

        for (const row of rows) {
          yield* Effect.provideService(
            ProposalsRepo.insert(proposalOf(row, now)),
            Database,
            database,
          );
        }
        return { data: rows.map(toView), downgradeReason: downgradeReason ?? null };
      }),
    )
    .handle("list", () =>
      Effect.gen(function* () {
        const database = yield* Database;
        const principal = yield* CurrentPrincipal;
        const rows = yield* Effect.provideService(
          ProposalsRepo.findPendingByProfile(principal.profileId),
          Database,
          database,
        );
        return { data: rows.map((p) => toView(modelToRow(p))) };
      }),
    )
    .handle("decide", ({ params, payload }) =>
      Effect.gen(function* () {
        const database = yield* Database;
        const profiles = yield* Profiles;
        const principal = yield* CurrentPrincipal;
        const id = decodeProposalId(params.id);

        const found = yield* Effect.provideService(
          ProposalsRepo.findByIdForProfile(id, principal.profileId),
          Database,
          database,
        );
        if (found === undefined) {
          return yield* Effect.fail(new NotFound({ message: `no proposal with id ${params.id}` }));
        }
        if (found.status !== "pending") {
          return yield* Effect.fail(
            new ProposalAlreadyDecided({ id: params.id, status: found.status }),
          );
        }
        if (payload.decision === "discarded" && payload.value !== undefined) {
          return yield* Effect.fail(
            new InvalidProposalValue({
              fieldPath: found.fieldPath,
              message: "discard does not accept a replacement value",
            }),
          );
        }
        if (payload.decision === "discarded") {
          const affected = yield* Effect.provideService(
            ProposalsRepo.markDiscarded(
              id,
              principal.profileId,
              DateTime.formatIso(yield* DateTime.now),
            ),
            Database,
            database,
          );
          if (affected === 1) {
            const current = yield* profiles.getVersioned(principal.profileId);
            return {
              decision: "discarded" as const,
              profile: current.profile,
              profileUpdatedAt: current.profileUpdatedAt,
            };
          }
          if (affected !== 0) {
            return yield* Effect.die(new ProposalDiscardAtomicityDefect(affected));
          }
          const after = yield* Effect.provideService(
            ProposalsRepo.findByIdForProfile(id, principal.profileId),
            Database,
            database,
          );
          if (after === undefined) {
            return yield* Effect.fail(
              new NotFound({ message: `no proposal with id ${params.id}` }),
            );
          }
          if (after.status !== "pending") {
            return yield* Effect.fail(
              new ProposalAlreadyDecided({ id: params.id, status: after.status }),
            );
          }
          return yield* Effect.die(new ProposalDiscardAtomicityDefect(affected));
        }

        // Accept: decode once against the immutable original proposal value,
        // then recompute the merged whole profile from each freshly read
        // profile snapshot inside the bounded compare-and-swap loop.
        const target = targetOf(found.fieldPath);
        if (target === undefined) {
          return yield* Effect.fail(
            new InvalidProposalValue({ fieldPath: found.fieldPath, message: "unknown field path" }),
          );
        }
        const decoded: unknown =
          payload.value === undefined
            ? yield* Schema.decodeUnknownEffect(target)(found.proposedValue).pipe(
                Effect.mapError(
                  (error) =>
                    new InvalidProposalValue({
                      fieldPath: found.fieldPath,
                      message: String(error),
                    }),
                ),
              )
            : yield* Schema.decodeUnknownEffect(Schema.fromJsonString(target))(payload.value).pipe(
                Effect.mapError(
                  (error) =>
                    new InvalidProposalValue({
                      fieldPath: found.fieldPath,
                      message: String(error),
                    }),
                ),
              );

        const decidedAt = DateTime.formatIso(yield* DateTime.now);
        for (let attempt = 1; attempt <= MAX_ACCEPT_ATTEMPTS; attempt += 1) {
          const accepted = yield* acceptProposal(
            database,
            principal.profileId,
            id,
            decidedAt,
            (current) => mergeProposal(current, found.fieldPath, decoded),
          );
          if (accepted !== undefined) {
            return {
              decision: "accepted" as const,
              profile: accepted.profile,
              profileUpdatedAt: accepted.profileUpdatedAt,
            };
          }

          const after = yield* Effect.provideService(
            ProposalsRepo.findByIdForProfile(id, principal.profileId),
            Database,
            database,
          );
          if (after === undefined) {
            return yield* Effect.fail(
              new NotFound({ message: `no proposal with id ${params.id}` }),
            );
          }
          if (after.status !== "pending") {
            return yield* Effect.fail(
              new ProposalAlreadyDecided({ id: params.id, status: after.status }),
            );
          }
          if (attempt === MAX_ACCEPT_ATTEMPTS) {
            return yield* Effect.fail(
              new ProfileDecisionConflict({ id: params.id, retryable: true }),
            );
          }
        }
        return yield* Effect.die("unreachable profile decision retry state");
      }),
    ),
);

import { Database } from "../services/Database.ts";
import { Ids } from "../services/Ids.ts";

const proposalOf = (
  row: PendingRow & { profileId: Proposal["profileId"] },
  createdAt: DateTime.DateTime,
): Proposal =>
  new Proposal({
    id: row.id,
    profileId: row.profileId,
    sourceKind: row.sourceKind,
    fieldPath: row.fieldPath,
    proposedValue: row.proposedValue,
    evidenceExcerpt: row.evidenceExcerpt,
    confidence: row.confidence,
    engine: row.engine,
    status: "pending",
    createdAt: DateTime.toUtc(createdAt),
    decidedAt: Option.none(),
  });

const modelToRow = (proposal: Proposal): PendingRow => ({
  id: proposal.id,
  sourceKind: proposal.sourceKind,
  fieldPath: proposal.fieldPath,
  proposedValue: proposal.proposedValue,
  evidenceExcerpt: proposal.evidenceExcerpt,
  confidence: proposal.confidence,
  engine: proposal.engine,
  createdAt: DateTime.formatIso(proposal.createdAt),
});

// --- merge semantics (normative core of WS-0016 § Route contracts) ------------

/**
 * Scalar paths replace; array-item paths append — no silent dedupe, because
 * duplicates are the reviewer's call, not the machine's. Preferences start
 * from the empty defaults (`preferencesOf` semantics), so a pre-preferences
 * profile gains its lists exactly once, here.
 */
export const mergeProposal = (
  profile: typeof Profile.Type,
  fieldPath: string,
  value: unknown,
): typeof Profile.Type => {
  switch (fieldPath) {
    case "headline":
    case "summary":
    case "location":
    case "languages":
      return { ...profile, [fieldPath]: value } as typeof Profile.Type;
  }

  const appended = asList(value);
  if (/^skills\.\d+$/.test(fieldPath)) {
    return { ...profile, skills: [...profile.skills, ...appended] };
  }
  if (/^education\.\d+$/.test(fieldPath)) {
    return { ...profile, education: [...profile.education, ...appended] };
  }
  if (/^experience\.\d+$/.test(fieldPath)) {
    return { ...profile, experience: [...profile.experience, value as Experience] };
  }

  const preferences = profile.preferences ?? {
    desiredRoles: [],
    desiredLocations: [],
    excludedTerms: [],
  };
  if (/^preferences\.desiredRoles\.\d+$/.test(fieldPath)) {
    return {
      ...profile,
      preferences: { ...preferences, desiredRoles: [...preferences.desiredRoles, ...appended] },
    };
  }
  if (/^preferences\.desiredLocations\.\d+$/.test(fieldPath)) {
    return {
      ...profile,
      preferences: {
        ...preferences,
        desiredLocations: [...preferences.desiredLocations, ...appended],
      },
    };
  }
  if (/^preferences\.excludedTerms\.\d+$/.test(fieldPath)) {
    return {
      ...profile,
      preferences: { ...preferences, excludedTerms: [...preferences.excludedTerms, ...appended] },
    };
  }
  return profile;
};

const asList = (value: unknown): Array<string> => {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  return typeof value === "string" ? [value] : [];
};

const evidenceOf = (text: string): string => {
  const collapsed = text.replace(/\s+/g, " ").trim();
  return collapsed.length <= 300 ? collapsed : `${collapsed.slice(0, 299)}…`;
};
