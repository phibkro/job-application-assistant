import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { ApplicationRecord } from "@job-index/domain/Applications";
import { DraftMissing, PolicyProhibited } from "@job-index/domain/Failure";
import type { ApplicationId, UserId } from "@job-index/domain/Ids";
import { Corpus } from "../services/Corpus.ts";
import { Database } from "../services/Database.ts";
import { Profiles } from "../services/Accounts.ts";
import { Drafting } from "../services/Drafting.ts";
import { Entitlements } from "../services/Entitlements.ts";
import { Policy } from "../services/Policy.ts";
import { Applications } from "../services/Applications.ts";
import type { ApplicationStatus, Prepared } from "../services/Applications.ts";
import { decidePreparation } from "./decide.ts";
import * as SavedJobs from "./savedJobs.ts";
import * as ApplicationRecords from "./applicationRecords.ts";
import { withDatabase } from "./db.ts";

/** The resolved `Applications` shape, derived from the frozen tag — see `corpus/databaseShape.ts`. */
type ApplicationsShape = Effect.Success<typeof Applications>;

/**
 * `decidePreparation` (see `decide.ts`) reuses `Access.canAutomate`, which
 * takes a `Tier` — but `Entitlements`' frozen tag exposes only a boolean
 * (`has`), never the tier itself, because `Applications.prepare` is meant to
 * go through the service, not read the account's subscription row directly:
 * a fake `Entitlements` layer must actually change this behaviour in a test.
 *
 * `permits(tier, "automated-apply")` is exactly what `has` already answers,
 * so a two-element `Tier` that reproduces that one boolean is a faithful
 * encoding of it, not a second, divergent read of the account — `until` is
 * never inspected by `permits` and carries no meaning here.
 */
const asTier = (
  entitled: boolean,
): { readonly _tag: "Free" } | { readonly _tag: "Premium"; readonly until: string } =>
  entitled ? { _tag: "Premium", until: "" } : { _tag: "Free" };

export const layer = Layer.effect(
  Applications,
  Effect.gen(function* () {
    const database = yield* Database;
    const corpus = yield* Corpus;
    const profiles = yield* Profiles;
    const drafting = yield* Drafting;
    const entitlements = yield* Entitlements;
    const policy = yield* Policy;
    const withDb = withDatabase(database);

    const prepare: ApplicationsShape["prepare"] = (user, savedJob, requested) =>
      Effect.gen(function* () {
        const saved = yield* withDb(SavedJobs.findById(savedJob));
        // A foreign owner is reported the same as "not found": a savedJob
        // id leaking whether someone else's bookmark exists is not this
        // endpoint's business to answer.
        if (saved === undefined || saved.profileId !== user) {
          return yield* Effect.fail(new DraftMissing({ savedJob }));
        }

        const job = yield* corpus.get(saved.canonicalJobId);
        if (job === undefined) {
          // The corpus is a rebuildable cache; a bookmark can outlive the
          // vacancy it pointed at. Nothing to draft from either way.
          return yield* Effect.fail(new DraftMissing({ savedJob }));
        }

        const profile = yield* profiles.get(saved.profileId);
        const documents = yield* drafting
          .compose(profile, job)
          .pipe(
            Effect.catchTag("ProfileIncomplete", () => Effect.fail(new DraftMissing({ savedJob }))),
          );

        const { platform, policy: platformPolicy } = yield* policy.forJob(saved.canonicalJobId);
        const entitled = yield* entitlements.has(user, "automated-apply");
        const decision = decidePreparation(asTier(entitled), platform, platformPolicy, requested);

        if (decision._tag === "Blocked") {
          // Constructed directly rather than via `Policy.requireAutomatable`:
          // that gate folds every non-`Allowed` policy into one failure,
          // which would lose the distinction `decidePreparation` already
          // made between "block outright" (`Prohibited`) and "downgrade to
          // assisted" (everything else non-`Allowed`).
          return yield* Effect.fail(
            new PolicyProhibited({ platform: decision.platform, policy: decision.policy }),
          );
        }
        if (decision._tag === "NeedsUpgrade") {
          // `require` raises the typed `EntitlementRequired` `prepare`
          // declares; reusing it here (rather than constructing the error by
          // hand) keeps one place responsible for that failure's shape.
          yield* entitlements.require(user, "automated-apply");
          return yield* Effect.die("unreachable: Entitlements.has and .require disagreed");
        }

        const now = yield* DateTime.now;
        const application = new ApplicationRecord({
          id: crypto.randomUUID() as ApplicationId,
          profileId: user,
          savedJobId: savedJob,
          canonicalJobId: saved.canonicalJobId,
          method: decision.method,
          status: "ready",
          applicationUrl: job.applicationUrl,
          cv: documents.cv,
          letter: documents.letter,
          generator: documents.generator,
          downgradeReason: Option.fromUndefinedOr(decision.downgradeReason),
          notes: "",
          createdAt: now,
          updatedAt: now,
        });
        yield* withDb(ApplicationRecords.insert(application));

        const prepared: Prepared = {
          application: application.id,
          method: decision.method,
          documents,
          applicationUrl: job.applicationUrl,
          downgradeReason: decision.downgradeReason,
        };
        return prepared;
      });

    const setStatus = (
      user: UserId,
      application: ApplicationId,
      status: ApplicationStatus,
      notes: string,
    ): Effect.Effect<void> =>
      Effect.gen(function* () {
        const existing = yield* withDb(ApplicationRecords.findByIdForProfile(application, user));
        // Total by contract: an unknown or foreign application id is a no-op,
        // not a failure — `setStatus` has no error channel to report one.
        if (existing === undefined) {
          return;
        }
        const now = yield* DateTime.now;
        yield* withDb(
          ApplicationRecords.update(
            new ApplicationRecord({
              id: existing.id,
              profileId: existing.profileId,
              savedJobId: existing.savedJobId,
              canonicalJobId: existing.canonicalJobId,
              method: existing.method,
              status,
              applicationUrl: existing.applicationUrl,
              cv: existing.cv,
              letter: existing.letter,
              generator: existing.generator,
              downgradeReason: existing.downgradeReason,
              notes,
              createdAt: existing.createdAt,
              updatedAt: now,
            }),
          ),
        );
      });

    return Applications.of({ prepare, setStatus });
  }),
);
