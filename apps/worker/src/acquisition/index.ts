import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type { PlatformId } from "@job-index/domain/Ids";
import { AdapterUnavailable } from "@job-index/domain/Failure";
import { resolve, resolveHydrate } from "@job-index/adapters/Registry";
import type { Registration } from "@job-index/adapters/Registry";
import { Acquisition } from "../services/Acquisition.ts";
import { SourceCatalog } from "../services/SourceCatalog.ts";

export type { Registration } from "@job-index/adapters/Registry";

/**
 * `Acquisition`, wired to an explicit, deployment-chosen list of adapters.
 *
 * `registrations` is a constructor argument rather than a fixed import list
 * for one reason: this is the composition-time seam a deployment uses to
 * include or exclude an adapter. Including one is adding it to the array (and
 * depending on the package that exports it); excluding one is leaving it out
 * — nothing is discovered, scanned, or loaded at runtime, so "this deployment
 * ships this adapter" stays a reviewable line in a source file. See
 * `design-specs/source-plugin-surface.md`.
 *
 * The platform's tier comes from `SourceCatalog`, never from the adapter: an
 * adapter is not asked to know its own tier, because that would let a plugin
 * grant itself a tier — and the tier is what `resolve` uses to find it.
 */
export const layer = (
  registrations: ReadonlyArray<Registration>,
): Layer.Layer<Acquisition, never, SourceCatalog> =>
  Layer.effect(
    Acquisition,
    Effect.gen(function* () {
      const catalog = yield* SourceCatalog;
      const tierFor = (platform: PlatformId) =>
        Effect.map(catalog.list(), (entries) => {
          const entry = entries.find((candidate) => candidate.id === platform);
          return entry?.tier._tag ?? "Unknown";
        });
      return Acquisition.of({
        page: (platform, cursor) =>
          Effect.gen(function* () {
            const tier = yield* tierFor(platform);
            if (tier === "Unknown") {
              return yield* Effect.fail(new AdapterUnavailable({ platform, tier }));
            }
            return yield* resolve(registrations, tier, platform, cursor);
          }),
        hydrate: (platform, externalId) =>
          Effect.gen(function* () {
            const tier = yield* tierFor(platform);
            if (tier === "Unknown") {
              return yield* Effect.fail(new AdapterUnavailable({ platform, tier }));
            }
            return yield* resolveHydrate(registrations, tier, platform, externalId);
          }),
      });
    }),
  );
