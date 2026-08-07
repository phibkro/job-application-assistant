import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { PlatformId, Sequence } from "@job-index/domain/Ids";
import type { LeaseHeld } from "@job-index/domain/Failure";

/**
 * One bounded collection run against one source.
 *
 * Every bound here exists because its absence caused a real failure mode: an
 * unbounded run exhausts the Worker's budget mid-write, a lease-free run lets
 * two schedules process the same cursor, and an unrecorded stop reason makes a
 * quiet week indistinguishable from a broken connector.
 */
export interface RunBudget {
  readonly maxPages: number;
  readonly maxObservations: number;
  readonly maxDurationMs: number;
  /**
   * How long a crashed run — one that never reaches `release` — blocks its
   * source before `SourceLease`'s recovery alarm reclaims it on the run's
   * behalf. Not a value any caller compares a clock against; it only ever
   * reaches the Durable Object that owns the comparison. See
   * `SourceLease.acquire`.
   */
  readonly leaseRecoveryMs: number;
}

export interface RunReport {
  readonly pages: number;
  readonly observations: number;
  readonly canonicalChanges: number;
  readonly cursorBefore: string;
  readonly cursorAfter: string;
  readonly highestSequence: Sequence;
  /** Why the run stopped: reached tail, budget exhausted, or a failure. */
  readonly stoppedReason: string;
  readonly durationMs: number;
}

export class Ingestion extends Context.Service<
  Ingestion,
  {
    /**
     * Acquires the lease, collects within budget, checkpoints only complete
     * pages, and releases. Fails with `LeaseHeld` rather than waiting, because
     * a scheduled trigger that queues behind another run will simply be due
     * again shortly.
     */
    readonly collect: (
      platform: PlatformId,
      budget: RunBudget,
    ) => Effect.Effect<RunReport, LeaseHeld>;
  }
>()("@job-index/Ingestion") {}
