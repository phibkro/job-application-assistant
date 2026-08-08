import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { CanonicalJob } from "@job-index/domain/Job";
import type { CanonicalJobId } from "@job-index/domain/Ids";

/**
 * Ensures a vacancy is hydrated, fetching its detail at most once.
 *
 * Kept apart from `Corpus` deliberately — the spec that named this slot
 * (`design-specs/deferred-hydration.md`) assumed hydration would live on
 * `Corpus`, and this is the one place this build diverges from it.
 * `Corpus`'s own layer (`corpus/index.ts`) depends on nothing but
 * `Database`, and its doc comment states that as the contract: "everything
 * after layer construction needs nothing further from its environment."
 * Reaching out to `Acquisition` — an HTTP call, a source's bearer token, a
 * per-vacancy lease — would break that for every caller of `Corpus`,
 * including ones (`Policy.forJob`, `listJobs`) that have no reason to ever
 * touch the network. `Hydration` composes `Corpus` (the read/write) with
 * `Acquisition` (the fetch) and `HydrationLease` (the "only once"
 * guarantee) one layer up, the same way `Ingestion` already composes
 * `Corpus` with `Acquisition` and `SourceLease` for the ingestion side of
 * this exact seam.
 */
export class Hydration extends Context.Service<
  Hydration,
  {
    /**
     * Idempotent: a `Hydrated` or `Closed` job returns immediately with no
     * fetch (falsifier 4's "second open issues no further fetch"). Two
     * concurrent callers for the same `Unhydrated` job fetch its detail
     * once — the loser waits briefly for the winner's write rather than
     * firing a second fetch (falsifier 5); if the winner does not finish
     * within that wait, the loser returns the job as it currently stands
     * rather than blocking indefinitely. `undefined` only when no such
     * canonical job exists at all. Never fails: a fetch that errors is
     * logged and the job is returned unhydrated, because "opening" a
     * vacancy must stay resilient to one flaky detail fetch — the callers
     * that must NOT proceed on an unhydrated result (`save`, and therefore
     * drafting/applying) check `Job.isHydrated` on what this returns and
     * fail loudly themselves; see `design-specs/deferred-hydration.md`'s
     * falsifier 6.
     */
    readonly hydrate: (id: CanonicalJobId) => Effect.Effect<CanonicalJob | undefined>;
  }
>()("@job-index/Hydration") {}
