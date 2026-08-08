import type * as Effect from "effect/Effect";
import * as Context from "effect/Context";
import type {
  CanonicalJob,
  DetailFields,
  JobStatus,
  NormalizedListing,
  ObservationOutcome,
} from "@job-index/domain/Job";
import type {
  CanonicalJobId,
  PlatformId,
  ProfileId,
  Sequence,
  SourceId,
} from "@job-index/domain/Ids";

/** What `Hydration` needs to route a detail fetch back to the adapter that produced this vacancy. */
export interface HydrationTarget {
  readonly platformId: PlatformId;
  readonly externalId: string;
}

/**
 * `listJobs`'s filter: `term` against title/employer, `location` against
 * location, `status` against the canonical's own status — each optional,
 * and folded the same way at match time that `search` folds them at write
 * time (see `corpus/search.ts`). All three absent is not a value this type
 * can express as "search with nothing", which is deliberate: see `search`
 * below for why that case is a different method rather than a different
 * argument.
 */
export interface JobFilter {
  readonly term?: string;
  readonly location?: string;
  readonly status?: JobStatus["_tag"];
}

/**
 * The canonical corpus, and what each person has already been offered.
 *
 * The corpus is a cache with provenance: it can be rebuilt from sources, which
 * is why identity need not match any previous implementation. Freshness is per
 * profile rather than per saved search, so "show me something new" means the
 * same thing in every surface — the list, a saved search, and the chat.
 */
export class Corpus extends Context.Service<
  Corpus,
  {
    /** Folds one observation in, reporting what it did rather than a count. */
    readonly observe: (listing: NormalizedListing) => Effect.Effect<ObservationOutcome>;
    readonly get: (id: CanonicalJobId) => Effect.Effect<CanonicalJob | undefined>;
    readonly changedSince: (
      sequence: Sequence,
      limit: number,
    ) => Effect.Effect<ReadonlyArray<CanonicalJob>>;
    /**
     * `changedSince`'s filtered counterpart, walked with the same
     * `sequence` cursor so a caller pages either one identically. Kept
     * separate rather than making `changedSince`'s filter always-optional:
     * an always-optional argument makes "no filter" a value every call site
     * must remember to pass, where a second method makes it a call site
     * that cannot exist — and it is `changedSince`'s plain scan, unchanged,
     * that keeps the unfiltered listing exactly as fast as it already was.
     */
    readonly search: (
      filter: JobFilter,
      cursor: Sequence,
      limit: number,
    ) => Effect.Effect<ReadonlyArray<CanonicalJob>>;
    /** Vacancies this profile has not been offered, newest first. */
    readonly fresh: (
      profile: ProfileId,
      limit: number,
    ) => Effect.Effect<ReadonlyArray<CanonicalJob>>;
    readonly markOffered: (profile: ProfileId, through: Sequence) => Effect.Effect<void>;

    /**
     * Closes what a source has stopped advertising.
     *
     * `observe` cannot do this and the contract wrongly implied it could:
     * closing a vacancy means every known occurrence is inactive, which is an
     * absence, and a single positive observation carries no absence. The caller
     * that completed a page knows which external ids it saw, so it is the only
     * one that can tell.
     *
     * Takes the ids seen, not the ids missing, because a caller can enumerate
     * what it found and cannot enumerate what it did not.
     */
    readonly closeAbsent: (
      source: SourceId,
      seenExternalIds: ReadonlyArray<string>,
    ) => Effect.Effect<ReadonlyArray<ObservationOutcome>>;

    /**
     * One active occurrence to hydrate this canonical job through, or
     * `undefined` if none is active (every source dropped it, but the
     * closure sweep has not yet run — nothing left to fetch from). Owned by
     * `Corpus`, not `Hydration`, because occurrence SQL already lives here
     * (`Database`'s own contract: "the only module that knows SQL" is
     * satisfied by keeping it in the one slot, not spreading it to a second
     * one that also wants it).
     */
    readonly occurrenceFor: (id: CanonicalJobId) => Effect.Effect<HydrationTarget | undefined>;

    /**
     * Writes a completed detail fetch onto the canonical row, idempotently:
     * the same `detail` in always produces the same row out, so a retry
     * after a crash between write and lease-release is harmless rather than
     * something a caller must guard against. A no-op (returns the row
     * unchanged) if the row is missing or already `Hydrated` — hydration
     * only ever moves forward.
     */
    readonly hydrateDetail: (
      id: CanonicalJobId,
      detail: DetailFields,
    ) => Effect.Effect<CanonicalJob | undefined>;

    /**
     * Closes a vacancy discovered gone *during* hydration — the advert
     * closed in the window between the feed page being written and the
     * detail fetch reaching it (falsifier 7). Distinct from `closeAbsent`:
     * that sweep closes what an ingestion run finished enumerating and did
     * not see again; this closes a single vacancy a hydration attempt
     * learned is gone, with no re-enumeration involved. A no-op if the row
     * is missing or already `Closed`.
     */
    readonly closeEarly: (id: CanonicalJobId) => Effect.Effect<CanonicalJob | undefined>;
  }
>()("@job-index/Corpus") {}
