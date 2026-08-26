import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as HttpApiBuilder from "effect/unstable/httpapi/HttpApiBuilder";
import { QuestionKey } from "@job-index/domain/Answer";
import { fromJson, toJson, toMarkdown } from "@job-index/domain/Profile";
import { historyToJson, historyToMarkdown } from "@job-index/domain/Applications";
import {
  api,
  CurrentPrincipal,
  InvalidProfileJson,
  StaleProfileUpdate,
  WORKSPACE_EXPORT_SCHEMA,
  WORKSPACE_EXPORT_VERSION,
} from "../Api.ts";
import * as DateTime from "effect/DateTime";
import { Applications } from "../services/Applications.ts";
import { Profiles } from "../services/Accounts.ts";
import { SavedJobs } from "../services/SavedJobs.ts";
import { Database } from "../services/Database.ts";
import { Entitlements, type Capability } from "../services/Entitlements.ts";
import * as DocumentsRepo from "../db/repositories/Documents.ts";
import * as ProposalsRepo from "../db/repositories/Proposals.ts";
import * as Labels from "../applications/labels.ts";

const decodeQuestionKey = Schema.decodeUnknownSync(QuestionKey);

/** `fromJson` throws `SchemaError` or `JSON.parse`'s `SyntaxError`; both carry the actionable text in `.message`. */
const describeImportFailure = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const ALL_CAPABILITIES: ReadonlyArray<Capability> = [
  "model-drafting",
  "automated-apply",
  "agent-acquisition",
  "scheduled-applications",
  "model-inference",
];

const newestFirst = <A extends { readonly createdAt: DateTime.DateTime }>(
  values: ReadonlyArray<A>,
  tieBreak: (value: A) => string,
): ReadonlyArray<A> =>
  values.toSorted(
    (left, right) =>
      DateTime.toEpochMillis(right.createdAt) - DateTime.toEpochMillis(left.createdAt) ||
      tieBreak(left).localeCompare(tieBreak(right)),
  );

const byId = <A extends { readonly id: unknown }>(value: A): string => String(value.id);

export const layer = HttpApiBuilder.group(api, "profile", (handlers) =>
  handlers
    .handle("me", () =>
      Effect.gen(function* () {
        const profiles = yield* Profiles;
        const entitlements = yield* Entitlements;
        const principal = yield* CurrentPrincipal;
        const current = yield* profiles.getVersioned(principal.profileId);
        const aiConsent = yield* profiles.aiConsent(principal.profileId);
        const held = yield* Effect.all(
          ALL_CAPABILITIES.map((capability) =>
            Effect.map(entitlements.has(principal.profileId, capability), (has) =>
              has ? capability : undefined,
            ),
          ),
        );
        return {
          profile: current.profile,
          capabilities: held.filter((c) => c !== undefined),
          profileUpdatedAt: current.profileUpdatedAt,
          aiConsent,
        };
      }),
    )
    /** WS-0019: consent is its own auditable statement, not a field on the CV's compare-and-swap. */
    .handle("setAiConsent", ({ payload }) =>
      Effect.gen(function* () {
        const profiles = yield* Profiles;
        const principal = yield* CurrentPrincipal;
        yield* profiles.setAiConsent(principal.profileId, payload.enabled);
        return { aiConsent: payload.enabled };
      }),
    )
    .handle("setProfile", ({ payload }) =>
      Effect.gen(function* () {
        const profiles = yield* Profiles;
        const principal = yield* CurrentPrincipal;
        return yield* profiles
          .setVersioned(principal.profileId, payload.profile, payload.expectedUpdatedAt)
          .pipe(
            Effect.mapError(
              (error) =>
                new StaleProfileUpdate({
                  expectedUpdatedAt: error.expectedUpdatedAt,
                  actualUpdatedAt: error.actualUpdatedAt,
                }),
            ),
          );
      }),
    )
    /**
     * A caller that knows how the question was asked says so; a person typing
     * an answer directly does not, and free text is what they are giving.
     * The label falls back to the question key for the same reason — better a
     * machine-readable stand-in than an invented sentence.
     */
    .handle("setAnswer", ({ params, payload }) =>
      Effect.gen(function* () {
        const profiles = yield* Profiles;
        const principal = yield* CurrentPrincipal;
        const question = decodeQuestionKey(params.question);
        yield* profiles.answer(principal.profileId, question, payload.value, {
          label: payload.label ?? params.question,
          shape: payload.shape ?? { _tag: "Text" },
        });
        return { question: params.question };
      }),
    )
    .handle("exportProfile", () =>
      Effect.gen(function* () {
        const profiles = yield* Profiles;
        const savedJobs = yield* SavedJobs;
        const applications = yield* Applications;
        const principal = yield* CurrentPrincipal;
        const profile = yield* profiles.get(principal.profileId);
        const saved = yield* savedJobs.list(principal.profileId);
        const prepared = yield* applications.history(principal.profileId);
        return {
          json: toJson(profile),
          markdown: toMarkdown(profile),
          history: {
            json: historyToJson(saved, prepared),
            markdown: historyToMarkdown(saved, prepared),
          },
        };
      }),
    )
    .handle("workspaceExport", () =>
      Effect.gen(function* () {
        const profiles = yield* Profiles;
        const savedJobs = yield* SavedJobs;
        const applications = yield* Applications;
        const database = yield* Database;
        const principal = yield* CurrentPrincipal;

        const profile = yield* profiles.get(principal.profileId);
        const answers = yield* profiles.answers(principal.profileId);
        const saved = yield* savedJobs.list(principal.profileId);
        const prepared = yield* applications.history(principal.profileId);
        const documents = yield* Effect.provideService(
          DocumentsRepo.findByProfile(principal.profileId),
          Database,
          database,
        );
        const proposals = yield* Effect.provideService(
          ProposalsRepo.findByProfile(principal.profileId),
          Database,
          database,
        );
        const labels = yield* Effect.provideService(
          Labels.findByProfile(principal.profileId),
          Database,
          database,
        );
        const assignments = yield* Effect.provideService(
          Labels.assigned(principal.profileId),
          Database,
          database,
        );

        const orderedApplications = newestFirst(prepared, byId);
        return {
          schema: WORKSPACE_EXPORT_SCHEMA,
          version: WORKSPACE_EXPORT_VERSION,
          exportedAt: DateTime.formatIso(yield* DateTime.now),
          data: {
            profile,
            answers: newestFirst(answers, (answer) => String(answer.question)),
            savedJobs: newestFirst(saved, byId),
            applications: orderedApplications,
            applicationEvents: orderedApplications.map((entry) => ({
              applicationId: entry.id,
              status: entry.status,
              method: entry.method,
              updatedAt: entry.updatedAt,
            })),
            documents: newestFirst(documents, byId),
            proposals: newestFirst(proposals, byId),
            labels: newestFirst(labels, byId),
            labelAssignments: assignments
              .map((assignment) => ({
                savedJobId: assignment.savedJobId,
                labelId: assignment.labelId,
              }))
              .toSorted(
                (left, right) =>
                  String(left.savedJobId).localeCompare(String(right.savedJobId)) ||
                  String(left.labelId).localeCompare(String(right.labelId)),
              ),
          },
        };
      }),
    )
    .handle("importProfile", ({ payload }) =>
      Effect.gen(function* () {
        const profiles = yield* Profiles;
        const principal = yield* CurrentPrincipal;
        const profile = yield* Effect.try({
          try: () => fromJson(payload.json),
          catch: (error) => new InvalidProfileJson({ message: describeImportFailure(error) }),
        });
        return yield* profiles
          .setVersioned(principal.profileId, profile, payload.expectedUpdatedAt)
          .pipe(
            Effect.mapError(
              (error) =>
                new StaleProfileUpdate({
                  expectedUpdatedAt: error.expectedUpdatedAt,
                  actualUpdatedAt: error.actualUpdatedAt,
                }),
            ),
          );
      }),
    ),
);
