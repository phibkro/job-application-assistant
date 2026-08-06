import type * as Effect from "effect/Effect";
import * as Context from "effect/Context";
import type { CanonicalJob, NormalizedListing, ObservationOutcome } from "@job-index/domain/Job";
import type { CanonicalJobId, ProfileId, Sequence } from "@job-index/domain/Ids";

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
    /** Vacancies this profile has not been offered, newest first. */
    readonly fresh: (
      profile: ProfileId,
      limit: number,
    ) => Effect.Effect<ReadonlyArray<CanonicalJob>>;
    readonly markOffered: (profile: ProfileId, through: Sequence) => Effect.Effect<void>;
  }
>()("@job-index/Corpus") {}
