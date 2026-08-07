import * as Layer from "effect/Layer";
import { layer as applicationsLayer } from "./applications.ts";
import { layer as entitlementsLayer } from "./entitlements.ts";
import { layer as policyLayer } from "./policy.ts";

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
 * Still required from outside: `Database`, `Corpus`, `Profiles`, `Drafting`
 * — every one of them a different slot's own layer.
 */
export const layer = applicationsLayer.pipe(
  Layer.provideMerge(Layer.mergeAll(entitlementsLayer, policyLayer)),
);
