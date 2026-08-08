import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
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
 * `AcquiredPage` and `SourceAdapter` — the interface an adapter satisfies —
 * are published from `@job-index/adapters` rather than defined here, because
 * an adapter is not always this codebase's to host: see
 * `design-specs/source-plugin-surface.md`. Re-exported so worker code that
 * only needs `Acquisition` has one import to reach both.
 */
export {
  SourceAdapter,
  type AcquiredPage,
  type HydrateOutcome,
} from "@job-index/adapters/SourceAdapter";
import type { AcquiredPage, HydrateOutcome } from "@job-index/adapters/SourceAdapter";

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
    /** One vacancy's detail — the counterpart `Hydration` calls instead of a whole page. */
    readonly hydrate: (
      platform: PlatformId,
      externalId: string,
    ) => Effect.Effect<
      HydrateOutcome,
      | AdapterUnavailable
      | DecodeFailed
      | RateLimited
      | RendererUnavailable
      | SourceUnavailable
      | Unauthorized
    >;
  }
>()("@job-index/Acquisition") {}
