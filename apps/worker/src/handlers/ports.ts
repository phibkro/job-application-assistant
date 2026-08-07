import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { AcquisitionTier, CatalogEntry } from "@job-index/domain/Source";
import type { Judgement } from "@job-index/domain/Freshness";
import type { CanonicalJobId, ProfileId, SavedJobId } from "@job-index/domain/Ids";

/**
 * CONTRACT GAP — read before touching this file.
 *
 * Three `Api.ts` endpoints (`applications.save`, `applications.draft`,
 * `feed.dismiss`) and one (`corpus.listSources`) need a capability no tag in
 * `services/` provides, and the tables they need already exist
 * (`saved_jobs` in migration 0008, `source_catalog` in 0006) with no
 * repository or service wrapping them:
 *
 * - creating a `saved_jobs` row (`save`) and resolving one back to a
 *   `CanonicalJobId` (`draft`) — `Applications` only covers `prepare` and
 *   `setStatus`, both of which already take a `SavedJobId` as given rather
 *   than minting or resolving one;
 * - recording a per-job judgement (`dismiss`) — `Corpus.markOffered` is a
 *   bulk high-water mark, not a per-job verdict, and `Judgement` (Freshness.ts)
 *   has nothing that writes it;
 * - reading the researched platform catalogue (`listSources`) — no tag reads
 *   `source_catalog` at all.
 *
 * These three tags are the smallest seam that makes each gap a typed,
 * visible dependency instead of a handler that silently drops what it was
 * asked to do. They are declared here — inside the handlers slot, the one
 * directory this slot owns — rather than in `services/`, because the real
 * shape (and whether `save`/`draft`'s two belong on `Applications` instead of
 * standing alone) is a call for whoever owns that layer, not this slot. Only
 * fakes back them today; the composition root has nothing real to provide
 * until one of these is implemented for real.
 */

export class SavedJobs extends Context.Service<
  SavedJobs,
  {
    readonly save: (
      profile: ProfileId,
      job: CanonicalJobId,
      note: string,
    ) => Effect.Effect<SavedJobId>;
    /** The live `CanonicalJobId` a saved job points at, or `undefined` if the saved job is unknown to this profile. */
    readonly resolve: (
      profile: ProfileId,
      saved: SavedJobId,
    ) => Effect.Effect<CanonicalJobId | undefined>;
  }
>()("@job-index/handlers/SavedJobs") {}

export class Judgements extends Context.Service<
  Judgements,
  {
    readonly record: (
      profile: ProfileId,
      job: CanonicalJobId,
      verdict: Judgement["verdict"],
      reason: string | undefined,
    ) => Effect.Effect<void>;
  }
>()("@job-index/handlers/Judgements") {}

export class SourceCatalog extends Context.Service<
  SourceCatalog,
  {
    readonly list: (tier?: AcquisitionTier) => Effect.Effect<ReadonlyArray<CatalogEntry>>;
  }
>()("@job-index/handlers/SourceCatalog") {}
