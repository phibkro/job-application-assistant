import * as Effect from "effect/Effect";
import type { AcquisitionTier } from "@job-index/domain/Source";
import type { PlatformId } from "@job-index/domain/Ids";
import { AdapterUnavailable } from "@job-index/domain/Failure";
import type { DecodeFailed, SourceUnavailable } from "@job-index/domain/Failure";
import type { AcquiredPage, HydrateOutcome, SourceAdapter } from "./SourceAdapter.ts";

/**
 * One adapter, registered against the tier it reads.
 *
 * The list of registrations is the "explicit configuration at composition
 * time" the plugin surface promises: it is an ordinary array literal, built
 * and reviewed like any other value, imported from whatever packages a
 * deployment chose to depend on. There is no scan of a directory and no
 * lookup by name — an adapter that is not in this list was never reachable in
 * the first place, and that is the whole exclusion mechanism.
 */
export interface Registration {
  readonly tier: AcquisitionTier["_tag"];
  readonly adapter: SourceAdapter["Service"];
}

/**
 * Resolves one page for a platform against an explicit adapter list.
 *
 * Dispatch is two-step, matching what the interface already exposes:
 * registrations are bucketed by tier first (a deployment may register several
 * adapters at the same tier — two "Feed" sources, say), and within a tier each
 * candidate's own `supports` decides whether it will act. `supports` exists
 * on the interface for exactly this: an adapter such as the NAV feed only
 * supports its one platform even though other platforms may share its tier,
 * so the first registration that both matches the tier and says yes wins.
 *
 * `AdapterUnavailable` is returned, never thrown or silently skipped, when no
 * registered adapter both matches the tier and supports the platform — the
 * same "no vacancies must never be indistinguishable from nobody has worked
 * out how to read this yet" guarantee `Acquisition`'s own doc comment states.
 */
export const resolve = (
  registrations: ReadonlyArray<Registration>,
  tier: AcquisitionTier["_tag"],
  platform: PlatformId,
  cursor: string,
): Effect.Effect<AcquiredPage, AdapterUnavailable | DecodeFailed | SourceUnavailable> =>
  Effect.gen(function* () {
    for (const registration of registrations) {
      if (registration.tier !== tier) continue;
      if (yield* registration.adapter.supports(platform)) {
        return yield* registration.adapter.page(platform, cursor);
      }
    }
    return yield* Effect.fail(new AdapterUnavailable({ platform, tier }));
  });

/** `resolve`'s counterpart for a targeted detail fetch — same dispatch, same "no match is a first-class outcome" contract. */
export const resolveHydrate = (
  registrations: ReadonlyArray<Registration>,
  tier: AcquisitionTier["_tag"],
  platform: PlatformId,
  externalId: string,
): Effect.Effect<HydrateOutcome, AdapterUnavailable | DecodeFailed | SourceUnavailable> =>
  Effect.gen(function* () {
    for (const registration of registrations) {
      if (registration.tier !== tier) continue;
      if (yield* registration.adapter.supports(platform)) {
        return yield* registration.adapter.hydrate(platform, externalId);
      }
    }
    return yield* Effect.fail(new AdapterUnavailable({ platform, tier }));
  });
