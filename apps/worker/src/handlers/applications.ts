import * as Effect from "effect/Effect";
import * as HttpApiBuilder from "effect/unstable/httpapi/HttpApiBuilder";
import type {
  DraftMissing,
  EntitlementRequired,
  PolicyProhibited,
  ProfileIncomplete,
} from "@job-index/domain/Failure";
import { api, CurrentPrincipal, ForbiddenByPlatform, NotFound, UpgradeRequired } from "../Api.ts";
import { Corpus } from "../services/Corpus.ts";
import { Profiles } from "../services/Accounts.ts";
import { Drafting } from "../services/Drafting.ts";
import { Entitlements } from "../services/Entitlements.ts";
import { Applications, statusForDecision } from "../services/Applications.ts";
import { SavedJobs } from "../services/SavedJobs.ts";
import { decodeApplicationId, decodeCanonicalJobId, decodeEnum, decodeSavedJobId } from "./wire.ts";

const decodeGenerator = decodeEnum("template", "model");
const decodeMethod = decodeEnum("assisted", "automated");
const decodeDecision = decodeEnum("approve", "rework", "decline");

export const layer = HttpApiBuilder.group(api, "applications", (handlers) =>
  handlers
    .handle("save", ({ payload }) =>
      Effect.gen(function* () {
        const corpus = yield* Corpus;
        const savedJobs = yield* SavedJobs;
        const principal = yield* CurrentPrincipal;
        const jobId = decodeCanonicalJobId(payload.jobId);
        const job = yield* corpus.get(jobId);
        if (job === undefined) {
          return yield* Effect.fail(new NotFound({ message: `no job with id ${payload.jobId}` }));
        }
        const savedJobId = yield* savedJobs.save(principal.profileId, jobId, payload.note ?? "");
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
        const corpus = yield* Corpus;
        const profiles = yield* Profiles;
        const entitlements = yield* Entitlements;
        const drafting = yield* Drafting;
        const principal = yield* CurrentPrincipal;

        const savedJobId = decodeSavedJobId(params.id);
        const jobId = yield* savedJobs.resolve(principal.profileId, savedJobId);
        if (jobId === undefined) {
          return yield* Effect.fail(new NotFound({ message: `no saved job with id ${params.id}` }));
        }
        const job = yield* corpus.get(jobId);
        if (job === undefined) {
          return yield* Effect.fail(
            new NotFound({ message: `saved job ${params.id} has no live listing` }),
          );
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
          .compose(profile, job)
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
    ),
);
