import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";

/**
 * One fresh opaque identifier.
 *
 * `SavedJob.save`, `Applications.prepare`, and `Ingestion.collect` (its
 * lease-owner token) each minted one with `crypto.randomUUID()` read straight
 * off the call site — which works, but makes "what id will this write get"
 * unfixable from a test the same way an ambient clock read makes an expiry
 * boundary unfixable (see `applications/decide.ts`). Routed through a service
 * instead: production asks the real generator (`runtime/Ids.ts`), a test can
 * hand it a fixed one and assert the exact id a save produced.
 */
export class Ids extends Context.Service<Ids, { readonly next: Effect.Effect<string> }>()(
  "@job-index/Ids",
) {}
