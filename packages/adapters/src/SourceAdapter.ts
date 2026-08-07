import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { RawListing } from "@job-index/domain/Job";
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
  }
>()("@job-index/SourceAdapter") {}
