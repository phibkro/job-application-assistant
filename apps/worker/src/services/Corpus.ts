import type * as Effect from "effect/Effect";
import * as Context from "effect/Context";
import type {
  CanonicalJob,
  JobStatus,
  NormalizedListing,
  ObservationOutcome,
} from "@job-index/domain/Job";
import type { CanonicalJobId, ProfileId, Sequence, SourceId } from "@job-index/domain/Ids";

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
  }
>()("@job-index/Corpus") {}
