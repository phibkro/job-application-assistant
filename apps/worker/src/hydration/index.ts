import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Result from "effect/Result";
import { isHydrated } from "@job-index/domain/Job";
import type { CanonicalJob } from "@job-index/domain/Job";
import type { CanonicalJobId } from "@job-index/domain/Ids";
import { Acquisition } from "../services/Acquisition.ts";
import { Corpus } from "../services/Corpus.ts";
import { HydrationLease } from "../services/HydrationLease.ts";
import { Hydration } from "../services/Hydration.ts";
import { Ids } from "../services/Ids.ts";

/**
 * How long a crashed hydration attempt — an isolate killed mid-fetch, not
 * merely a slow one — blocks a vacancy before `HydrationLease`'s recovery
 * alarm reclaims it. Short next to `SourceLease`'s ingestion-run recovery
 * (90s): a hydration attempt is one HTTP call, not a multi-page walk.
 */
const RECOVER_AFTER_MS = 15_000;

/**
 * How long a caller that lost the lease race waits for the winner's write
 * before giving up and returning the job as it currently stands. Bounded
 * and short: this runs inside an HTTP handler, and a lease-loser blocking
 * indefinitely on another request's network I/O is worse than occasionally
 * returning a job one beat behind.
 */
const POLL_ATTEMPTS = 6;
const POLL_INTERVAL_MS = 150;

const isSettled = (job: CanonicalJob): boolean => isHydrated(job) || job.status._tag === "Closed";

export const layer = Layer.effect(
  Hydration,
  Effect.gen(function* () {
    const corpus = yield* Corpus;
    const acquisition = yield* Acquisition;
    const lease = yield* HydrationLease;
    const ids = yield* Ids;

    /** Polls for the winner's write rather than fetching a second time. */
    const waitForSettled = (id: CanonicalJobId): Effect.Effect<CanonicalJob | undefined> =>
      Effect.gen(function* () {
        let current = yield* corpus.get(id);
        let attempt = 0;
        while (current !== undefined && !isSettled(current) && attempt < POLL_ATTEMPTS) {
          yield* Effect.sleep(POLL_INTERVAL_MS);
          current = yield* corpus.get(id);
          attempt += 1;
        }
        return current;
      });

    /** The actual fetch, gated on holding the lease — always released. */
    const fetchAndApply = (
      id: CanonicalJobId,
      job: CanonicalJob,
      owner: string,
    ): Effect.Effect<CanonicalJob> =>
      Effect.gen(function* () {
        const target = yield* corpus.occurrenceFor(id);
        if (target === undefined) {
          // Every source dropped it and the closure sweep has not run yet
          // — nothing active left to fetch detail from.
          return job;
        }
        const attempt = yield* Effect.result(
          acquisition.hydrate(target.platformId, target.externalId),
        );
        if (Result.isFailure(attempt)) {
          yield* Effect.logWarning("hydration fetch failed", {
            job: id,
            platform: target.platformId,
            failure: attempt.failure,
          });
          return job;
        }
        const outcome = attempt.success;
        return outcome._tag === "ClosedSince"
          ? ((yield* corpus.closeEarly(id)) ?? job)
          : ((yield* corpus.hydrateDetail(id, outcome.detail)) ?? job);
      }).pipe(Effect.ensuring(lease.release(id, owner)));

    const hydrate = (id: CanonicalJobId): Effect.Effect<CanonicalJob | undefined> =>
      Effect.gen(function* () {
        const job = yield* corpus.get(id);
        if (job === undefined || isSettled(job)) return job;

        const owner = yield* ids.next;
        const outcome = yield* lease.acquire(id, owner, RECOVER_AFTER_MS);
        if (outcome._tag === "Held") {
          return yield* waitForSettled(id);
        }
        return yield* fetchAndApply(id, job, owner);
      });

    return Hydration.of({ hydrate });
  }),
);
