import * as Layer from "effect/Layer";
import { layer as applicationsLayer } from "./applications.ts";
import { layer as entitlementsLayer } from "./entitlements.ts";
import { layer as policyLayer } from "./policy.ts";
import { layer as savedJobsLayer } from "./savedJobsService.ts";

/**
 * `Applications`, `Entitlements`, and `Policy`, wired together.
 *
 * `applicationsLayer` requires `Entitlements` and `Policy` from its own
 * context — it calls them as services, not as tables, which is the whole
 * point of keeping subscription and platform permission separate (see
 * `services/Policy.ts`). `provideMerge` feeds the other two layers into that
 * requirement while keeping all three visible in the output, so a caller
 * that only needs `Entitlements` (a future scheduling slot, say) can still
 * take this `layer` alone rather than reassembling the three by hand.
 *
 * `SavedJobs` joins them because it is the same table and the same lifecycle:
 * a saved job is what `prepare` takes as its argument, and two owners on
 * `saved_jobs` would be one too many.
 *
 * Still required from outside: `Database`, `Profiles`, `Drafting` — every
 * one of them a different slot's own layer. `Corpus` is no longer among
 * them: both `prepare` and `draft` (see `handlers/applications.ts`) now work
 * from a `SavedJob`'s own frozen `jobSnapshot` rather than reading the
 * corpus a second time; only the `save` handler still needs `Corpus`
 * directly, to confirm the vacancy exists before bookmarking it.
 */
export const layer = applicationsLayer.pipe(
  Layer.provideMerge(Layer.mergeAll(entitlementsLayer, policyLayer, savedJobsLayer)),
);
