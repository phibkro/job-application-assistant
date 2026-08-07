import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { PlatformId } from "@job-index/domain/Ids";

/**
 * Whether `acquire` won the right to run this platform's sweep, or who
 * already holds it. Not an expiry timestamp: the caller has nothing to
 * compare it against, because there is nothing left for a caller to decide —
 * the Durable Object behind this service already decided.
 */
export type LeaseOutcome =
  | { readonly _tag: "Granted" }
  | { readonly _tag: "Held"; readonly owner: string };

/**
 * One collector at a time, per platform — enforced by a Durable Object, one
 * per platform, rather than by comparing timestamps in a store with no
 * locks. See `ingestion/SourceLeaseObject.ts` for the object itself and why
 * that is the actual serialization point, not this interface.
 */
export class SourceLease extends Context.Service<
  SourceLease,
  {
    /**
     * Asks whether this run may proceed. `recoverAfterMs` bounds how long a
     * run that never calls `release` — a worker killed mid-run, not merely a
     * slow one — blocks this platform: the Durable Object schedules its own
     * recovery alarm at acquire time and reclaims the lease when it fires,
     * so a stuck lease self-heals without any caller ever comparing a clock.
     */
    readonly acquire: (
      platform: PlatformId,
      owner: string,
      recoverAfterMs: number,
    ) => Effect.Effect<LeaseOutcome>;
    /** A no-op if `owner` is not who currently holds the lease. */
    readonly release: (platform: PlatformId, owner: string) => Effect.Effect<void>;
  }
>()("@job-index/SourceLease") {}
