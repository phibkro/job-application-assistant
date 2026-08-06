import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { RawListing } from "@job-index/domain/Job";
import type { PlatformId } from "@job-index/domain/Ids";
import type {
  AdapterUnavailable,
  DecodeFailed,
  RateLimited,
  RendererUnavailable,
  SourceUnavailable,
  Unauthorized,
} from "@job-index/domain/Failure";

/**
 * Reading listings from a platform, whatever it takes to read them.
 *
 * This is the interface behind "a source without an API gets one". The tier
 * recorded in the catalogue selects the implementation — official feed,
 * scripted extraction, or a rendered page — and callers do not know which
 * they got.
 *
 * `AdapterUnavailable` is a first-class outcome rather than an empty list.
 * Ninety-five of the catalogued platforms have no established way to be read,
 * and "no vacancies" must never be indistinguishable from "nobody has worked
 * out how to read this yet".
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

export class Acquisition extends Context.Service<
  Acquisition,
  {
    /**
     * One bounded page. Bounded because an unbounded read is an unbounded
     * bill on the agent tier, and an unbounded run on any tier.
     */
    readonly page: (
      platform: PlatformId,
      cursor: string,
    ) => Effect.Effect<
      AcquiredPage,
      | AdapterUnavailable
      | DecodeFailed
      | RateLimited
      | RendererUnavailable
      | SourceUnavailable
      | Unauthorized
    >;
  }
>()("@job-index/Acquisition") {}

/**
 * A single acquisition mechanism. Registered per tier; never chosen by itself.
 *
 * Kept separate from `Acquisition` so an adapter can be tested against a
 * recorded payload with no catalogue, no entitlement, and no database.
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
