import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { DetailFields, RawListing } from "@job-index/domain/Job";
import type { PlatformId } from "@job-index/domain/Ids";
import type { DecodeFailed, SourceUnavailable } from "@job-index/domain/Failure";

/**
 * One page read from one platform, by whatever tier read it.
 *
 * `AcquiredPage` and `SourceAdapter` live here rather than in `apps/worker`
 * because this is the contract an adapter compiles against, and an adapter
 * does not have to live in this repository. Some sources sit in a legal grey
 * area for automated collection; a deployment that will not host or ship that
 * adapter still needs a stable interface to hand the operator who writes it
 * elsewhere. `apps/worker` is a Cloudflare Worker with D1, HTTP routing, and
 * this project's own release process — none of that belongs in what an
 * out-of-tree adapter depends on, so the interface is published from this
 * package instead, which has no dependency but `effect` and `@job-index/domain`.
 *
 * See `design-specs/source-plugin-surface.md` for the full contract.
 */
export interface AcquiredPage {
  readonly listings: ReadonlyArray<RawListing>;
  /** Opaque to the caller; the adapter's resume point. */
  readonly cursor: string;
  /** False when this page is the tail, so a bounded run knows to stop. */
  readonly more: boolean;
  /** Which mechanism produced this, for telemetry and for the run ledger. */
  readonly via: "feed" | "scripted" | "rendered";
}

/**
 * What one targeted detail fetch found.
 *
 * `ClosedSince` is not a failure: NAV answering "this advert is gone" for an
 * entry its own feed still called active a moment ago is the lifecycle
 * working, exactly as `nav/decode.ts`'s `isClosedSince` already documents
 * for the page-time case. `Hydration` (the worker service that calls this)
 * closes the vacancy rather than writing an empty `Hydrated` value — see
 * `design-specs/deferred-hydration.md`'s falsifier 7.
 */
export type HydrateOutcome =
  | { readonly _tag: "Hydrated"; readonly detail: DetailFields }
  | { readonly _tag: "ClosedSince" };

/**
 * A single acquisition mechanism. Registered per tier; never chosen by itself.
 *
 * Kept separate from `Acquisition` (`apps/worker/src/services/Acquisition.ts`)
 * so an adapter can be tested against a recorded payload with no catalogue, no
 * entitlement, and no database — and so it can be built, tested, and reviewed
 * as its own package with no path back into the Worker.
 *
 * An adapter never decides whether it is allowed to run. `supports` is only
 * "can I read this platform's shape", never "may I". Automation policy is
 * `Policy`'s question, asked before an adapter is ever reached; an adapter has
 * no way to answer it and must not be given one.
 */
export class SourceAdapter extends Context.Service<
  SourceAdapter,
  {
    readonly supports: (platform: PlatformId) => Effect.Effect<boolean>;
    readonly page: (
      platform: PlatformId,
      cursor: string,
    ) => Effect.Effect<AcquiredPage, DecodeFailed | SourceUnavailable>;
    /**
     * One vacancy's detail, fetched on demand rather than as part of a page
     * — see `design-specs/deferred-hydration.md`. An adapter whose `page`
     * already returns everything a detail fetch could (JSON-LD: one scrape
     * per vacancy, no cheaper summary tier underneath it) implements this
     * defensively rather than as a genuine no-op: it has nothing cached to
     * hand back for an arbitrary `externalId`, and in practice a vacancy
     * that adapter produced is never `Unhydrated` in the first place (its
     * `RawListing.hydrated` is always `true`), so this path is not expected
     * to be reached. See that adapter's own `hydrate` for the reasoning.
     */
    readonly hydrate: (
      platform: PlatformId,
      externalId: string,
    ) => Effect.Effect<HydrateOutcome, DecodeFailed | SourceUnavailable>;
  }
>()("@job-index/SourceAdapter") {}
