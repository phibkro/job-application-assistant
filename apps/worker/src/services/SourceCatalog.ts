import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { AcquisitionTier, CatalogEntry } from "@job-index/domain/Source";

/**
 * The researched platform catalogue: which sources exist, at what acquisition
 * tier, under what automation policy.
 *
 * Named in the module map from the start and never implemented; `source_catalog`
 * has existed since migration 0006. It is read by more than the one endpoint
 * that exposed the gap — acquisition dispatches on tier, and policy resolves a
 * platform's automation stance — so it is a service, not a query helper.
 */
export class SourceCatalog extends Context.Service<
  SourceCatalog,
  {
    readonly list: (tier?: AcquisitionTier) => Effect.Effect<ReadonlyArray<CatalogEntry>>;
  }
>()("@job-index/SourceCatalog") {}
