import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { CanonicalJobId } from "@job-index/domain/Ids";
import type { LeaseOutcome } from "./SourceLease.ts";

export type { LeaseOutcome } from "./SourceLease.ts";

/**
 * One in-flight detail fetch at a time, per vacancy — `SourceLease`'s exact
 * shape (see its own doc comment), reused for a second, unrelated keyspace
 * rather than reimplemented.
 *
 * A per-vacancy Durable Object sounds like a lot of objects next to one per
 * *source* (there are dozens of sources, potentially thousands of opened
 * vacancies), but the alternative considered and rejected was a D1
 * compare-and-swap row (`UPDATE canonical_jobs SET hydrationTag =
 * 'Hydrating' WHERE id = ? AND hydrationTag = 'Unhydrated'`, the loser's
 * `UPDATE` touching zero rows). `Database.run`/`Database.atomic`
 * deliberately return no affected-row count (see `Database.ts`'s own
 * doc comment on why: D1's batch API offers no interactive transaction to
 * build one on top of) — a CAS needs exactly the signal that interface was
 * designed not to expose, so building one would mean widening a frozen
 * contract for this one caller. Reusing the already-proven DO lease costs
 * one object per vacancy someone actually opens (a small fraction of the
 * corpus, not all of it) and each is idle the instant its fetch completes.
 *
 * `ingestion/SourceLeaseObject.ts` implements both this and `SourceLease`
 * against the SAME Durable Object *class* and the SAME Cloudflare binding
 * (`SOURCE_LEASE`) — see its `hydrationLeaseLayer`. Two logical lock
 * domains sharing one physical namespace, kept from colliding by a key
 * prefix (`hydrate:<jobId>`), needs no new Cloudflare resource and no
 * deploy-time binding change.
 */
export class HydrationLease extends Context.Service<
  HydrationLease,
  {
    readonly acquire: (
      job: CanonicalJobId,
      owner: string,
      recoverAfterMs: number,
    ) => Effect.Effect<LeaseOutcome>;
    readonly release: (job: CanonicalJobId, owner: string) => Effect.Effect<void>;
  }
>()("@job-index/HydrationLease") {}
