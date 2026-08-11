import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as HttpApiBuilder from "effect/unstable/httpapi/HttpApiBuilder";
import { isHydrated } from "@job-index/domain/Job";
import type {
  CustomLabelMissing,
  DraftMissing,
  EntitlementRequired,
  InvalidApplicationTransition as DomainInvalidApplicationTransition,
  LabelNameConflict,
  PolicyProhibited,
  ProfileIncomplete,
  ReservedLabelMutation as DomainReservedLabelMutation,
  SavedJobMissing,
  StaleApplicationUpdate as DomainStaleApplicationUpdate,
} from "@job-index/domain/Failure";
import {
  api,
  CurrentPrincipal,
  ForbiddenByPlatform,
  InvalidApplicationTransition,
  LabelConflict,
  NotFound,
  ReservedLabelMutation,
  StaleApplicationUpdate,
  UpgradeRequired,
} from "../Api.ts";
import { Hydration } from "../services/Hydration.ts";
import { Profiles } from "../services/Accounts.ts";
import { Drafting } from "../services/Drafting.ts";
import { Entitlements } from "../services/Entitlements.ts";
import { Applications, statusForDecision } from "../services/Applications.ts";
import { Saved } from "../services/Saved.ts";
import { SavedJobs } from "../services/SavedJobs.ts";
import {
  decodeApplicationId,
  decodeCanonicalJobId,
  decodeCustomLabelId,
  decodeEnum,
  decodeSavedJobId,
} from "./wire.ts";

const decodeGenerator = decodeEnum("template", "model");
const decodeMethod = decodeEnum("assisted", "automated");
const decodeDecision = decodeEnum("approve", "rework", "decline");

export const layer = HttpApiBuilder.group(api, "applications", (handlers) =>
  handlers
    .handle("save", ({ payload }) =>
      Effect.gen(function* () {
        const hydration = yield* Hydration;
        const savedJobs = yield* SavedJobs;
        const principal = yield* CurrentPrincipal;
        const jobId = decodeCanonicalJobId(payload.jobId);
        // `save` is the one hard precondition for hydration: `SavedJobs.save`
        // takes a snapshot (`Job.snapshotOf`) that composes `description`
        // into every future draft, so it must never run against a job this
        // could not hydrate. `isHydrated` is what makes that a compile-time
        // fact rather than a runtime check — `savedJobs.save` below only
        // type-checks inside this branch. A job that does not exist, or one
        // that turned out closed before hydration could complete, both fail
        // the same way: `NotFound` is the only error `save` declares (see
        // `Api.ts`), so "could not hydrate" and "never existed" are
        // deliberately indistinguishable on the wire, the same way
        // `SavedJobs.resolve` already treats "someone else's" as absent.
        const job = yield* hydration.hydrate(jobId);
        if (job === undefined || !isHydrated(job)) {
          return yield* Effect.fail(new NotFound({ message: `no job with id ${payload.jobId}` }));
        }
        const savedJobId = yield* savedJobs.save(principal.profileId, job, payload.note ?? "");
        return { savedJobId };
      }),
    )
    /**
     * `UpgradeRequired` maps from `Entitlements.require("model-drafting")`,
     * checked here rather than inside `Drafting.compose` — that tag takes no
     * generator argument at all (see `services/Drafting.ts`: "Entitlement is
     * checked before this service is reached"), so which implementation runs
     * is exactly this handler's decision, not something `compose` chooses
     * from a parameter.
     */
    .handle("draft", ({ params, payload }) =>
      Effect.gen(function* () {
        const savedJobs = yield* SavedJobs;
        const profiles = yield* Profiles;
        const entitlements = yield* Entitlements;
        const drafting = yield* Drafting;
        const principal = yield* CurrentPrincipal;

        const savedJobId = decodeSavedJobId(params.id);
        // The saved job's own frozen `jobSnapshot`, not a fresh `Corpus.get`
        // — drafting a preview and preparing the actual application now
        // read the same historical advert, so the two can never disagree
        // about what was applied to, and a corpus prune cannot 404 this.
        const snapshot = yield* savedJobs.resolve(principal.profileId, savedJobId);
        if (snapshot === undefined) {
          return yield* Effect.fail(new NotFound({ message: `no saved job with id ${params.id}` }));
        }

        const generator = decodeGenerator(payload.generator, "template");
        if (generator === "model") {
          yield* entitlements
            .require(principal.profileId, "model-drafting")
            .pipe(
              Effect.catchTag("EntitlementRequired", (e: EntitlementRequired) =>
                Effect.fail(new UpgradeRequired({ capability: e.capability })),
              ),
            );
        }

        const profile = yield* profiles.get(principal.profileId);
        const documents = yield* drafting
          .compose(profile, snapshot)
          .pipe(
            Effect.catchTag("ProfileIncomplete", (e: ProfileIncomplete) =>
              Effect.fail(new NotFound({ message: `profile is missing: ${e.missing}` })),
            ),
          );
        return documents;
      }),
    )
    .handle("prepare", ({ params, payload }) =>
      Effect.gen(function* () {
        const applications = yield* Applications;
        const principal = yield* CurrentPrincipal;
        const savedJobId = decodeSavedJobId(params.id);
        const method = decodeMethod(payload.method, "assisted");

        const prepared = yield* applications.prepare(principal.profileId, savedJobId, method).pipe(
          Effect.catchTags({
            DraftMissing: (e: DraftMissing) =>
              Effect.fail(new NotFound({ message: `no draft for saved job ${e.savedJob}` })),
            EntitlementRequired: (e: EntitlementRequired) =>
              Effect.fail(new UpgradeRequired({ capability: e.capability })),
            PolicyProhibited: (e: PolicyProhibited) =>
              Effect.fail(new ForbiddenByPlatform({ platform: e.platform, policy: e.policy })),
          }),
        );

        return {
          applicationId: prepared.application,
          method: prepared.method,
          applicationUrl: prepared.applicationUrl,
          cv: prepared.documents.cv,
          letter: prepared.documents.letter,
          downgradeReason: prepared.downgradeReason ?? null,
        };
      }),
    )
    /** A decision on an application that is not this profile's is a 404, not a
     *  silent success — see `Applications.setStatus`. */
    .handle("decide", ({ params, payload }) =>
      Effect.gen(function* () {
        const applications = yield* Applications;
        const principal = yield* CurrentPrincipal;
        const applicationId = decodeApplicationId(params.id);
        const decision = decodeDecision(payload.decision);
        const status = statusForDecision(decision);
        yield* Effect.mapError(
          applications.setStatus(principal.profileId, applicationId, status, payload.notes ?? ""),
          (missing) => new NotFound({ message: `no application with id ${missing.application}` }),
        );
        return { applicationId: params.id, status };
      }),
    )
    .handle("listSaved", ({ query }) =>
      Effect.gen(function* () {
        const saved = yield* Saved;
        const principal = yield* CurrentPrincipal;
        const view = decodeEnum(
          "all",
          "active",
          "needs-action",
          "applied",
          "closed",
        )(query.view, "all");
        const sort = decodeEnum(
          "recently-saved",
          "deadline-soon",
          "recently-updated",
        )(query.sort, "recently-saved");
        return yield* saved.list(principal.profileId, {
          view,
          sort,
          cursor: query.cursor,
          label: query.label === undefined ? undefined : decodeCustomLabelId(query.label),
        });
      }),
    )
    .handle("listSavedLabels", () =>
      Effect.gen(function* () {
        const saved = yield* Saved;
        const principal = yield* CurrentPrincipal;
        const labels = yield* saved.labels(principal.profileId);
        return {
          data: labels.map((label) => ({
            id: label.id,
            name: label.name,
            normalizedName: label.normalizedName,
            createdAt: DateTime.formatIso(label.createdAt),
            updatedAt: DateTime.formatIso(label.updatedAt),
          })),
        };
      }),
    )
    .handle("createSavedLabel", ({ payload }) =>
      Effect.gen(function* () {
        const saved = yield* Saved;
        const principal = yield* CurrentPrincipal;
        const label = yield* saved.createLabel(principal.profileId, payload.name).pipe(
          Effect.catchTags({
            LabelNameConflict: (error: LabelNameConflict) =>
              Effect.fail(
                new LabelConflict({ name: error.name, normalizedName: error.normalizedName }),
              ),
            ReservedLabelMutation: (error: DomainReservedLabelMutation) =>
              Effect.fail(new ReservedLabelMutation({ name: error.name })),
          }),
        );
        return {
          id: label.id,
          name: label.name,
          normalizedName: label.normalizedName,
          createdAt: DateTime.formatIso(label.createdAt),
          updatedAt: DateTime.formatIso(label.updatedAt),
        };
      }),
    )
    .handle("renameSavedLabel", ({ params, payload }) =>
      Effect.gen(function* () {
        const saved = yield* Saved;
        const principal = yield* CurrentPrincipal;
        const label = yield* saved
          .renameLabel(principal.profileId, decodeCustomLabelId(params.id), payload.name)
          .pipe(
            Effect.catchTags({
              CustomLabelMissing: (error: CustomLabelMissing) =>
                Effect.fail(new NotFound({ message: `no label with id ${error.label}` })),
              LabelNameConflict: (error: LabelNameConflict) =>
                Effect.fail(
                  new LabelConflict({ name: error.name, normalizedName: error.normalizedName }),
                ),
              ReservedLabelMutation: (error: DomainReservedLabelMutation) =>
                Effect.fail(new ReservedLabelMutation({ name: error.name })),
            }),
          );
        return {
          id: label.id,
          name: label.name,
          normalizedName: label.normalizedName,
          createdAt: DateTime.formatIso(label.createdAt),
          updatedAt: DateTime.formatIso(label.updatedAt),
        };
      }),
    )
    .handle("deleteSavedLabel", ({ params }) =>
      Effect.gen(function* () {
        const saved = yield* Saved;
        const principal = yield* CurrentPrincipal;
        yield* saved
          .deleteLabel(principal.profileId, decodeCustomLabelId(params.id))
          .pipe(
            Effect.catchTag("CustomLabelMissing", (error) =>
              Effect.fail(new NotFound({ message: `no label with id ${error.label}` })),
            ),
          );
        return { deleted: params.id };
      }),
    )
    .handle("setSavedLabels", ({ params, payload }) =>
      Effect.gen(function* () {
        const saved = yield* Saved;
        const principal = yield* CurrentPrincipal;
        const savedJobId = decodeSavedJobId(params.id);
        const labelIds = payload.labelIds.map((labelId) => decodeCustomLabelId(labelId));
        yield* saved.setLabels(principal.profileId, savedJobId, labelIds).pipe(
          Effect.catchTags({
            SavedJobMissing: (error: SavedJobMissing) =>
              Effect.fail(new NotFound({ message: `no saved job with id ${error.savedJob}` })),
            CustomLabelMissing: (error: CustomLabelMissing) =>
              Effect.fail(new NotFound({ message: `no label with id ${error.label}` })),
            ReservedLabelMutation: (error: DomainReservedLabelMutation) =>
              Effect.fail(new ReservedLabelMutation({ name: error.name })),
          }),
        );
        return { savedJobId: params.id, labelIds: payload.labelIds };
      }),
    )
    .handle("addApplicationEvent", ({ params, payload }) =>
      Effect.gen(function* () {
        const applications = yield* Applications;
        const principal = yield* CurrentPrincipal;
        const result = yield* applications
          .recordEvent(
            principal.profileId,
            decodeApplicationId(params.id),
            payload.event,
            payload.notes,
            payload.expectedUpdatedAt,
          )
          .pipe(
            Effect.catchTags({
              ApplicationMissing: () =>
                Effect.fail(new NotFound({ message: `no application with id ${params.id}` })),
              InvalidApplicationTransition: (error: DomainInvalidApplicationTransition) =>
                Effect.fail(
                  new InvalidApplicationTransition({
                    applicationId: error.application,
                    currentStatus: error.currentStatus,
                    event: error.event,
                    reason: error.reason,
                  }),
                ),
              StaleApplicationUpdate: (error: DomainStaleApplicationUpdate) =>
                Effect.fail(
                  new StaleApplicationUpdate({
                    applicationId: error.application,
                    expectedUpdatedAt: error.expectedUpdatedAt,
                    actualUpdatedAt: error.actualUpdatedAt,
                  }),
                ),
            }),
          );
        return result;
      }),
    )
    .handle("listSavedApplicationHistory", ({ params }) =>
      Effect.gen(function* () {
        const applications = yield* Applications;
        const principal = yield* CurrentPrincipal;
        const history = yield* applications
          .historyForSaved(principal.profileId, decodeSavedJobId(params.id))
          .pipe(
            Effect.catchTag("SavedJobMissing", () =>
              Effect.fail(new NotFound({ message: `no saved job with id ${params.id}` })),
            ),
          );
        return { data: history };
      }),
    ),
);
