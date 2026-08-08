import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type { CatalogEntry } from "@job-index/domain/Source";
import type { PlatformId } from "@job-index/domain/Ids";
import type { SourceAdapter } from "@job-index/adapters/SourceAdapter";
import type { Registration } from "@job-index/adapters/Registry";
import { Acquisition } from "../services/Acquisition.ts";
import { SourceCatalog } from "../services/SourceCatalog.ts";
import { layer } from "./index.ts";

const entry = (overrides: Partial<CatalogEntry> = {}): CatalogEntry => ({
  id: "arbeidsplassen-nav" as PlatformId,
  platform: "NAV",
  category: "public",
  listingsUrl: "https://pam-stilling-feed.nav.no",
  tier: { _tag: "Feed" },
  policy: { _tag: "Unreviewed" },
  requiresPremium: false,
  priority: "P1",
  confidence: "high",
  notes: "",
  verifiedAt: "2026-01-01",
  ...overrides,
});

const catalogOf = (entries: ReadonlyArray<CatalogEntry>) =>
  Layer.succeed(SourceCatalog, SourceCatalog.of({ list: () => Effect.succeed(entries) }));

const feedAdapter: SourceAdapter["Service"] = {
  supports: (platform) => Effect.succeed(platform === "arbeidsplassen-nav"),
  page: () => Effect.succeed({ listings: [], cursor: "next", more: false, via: "feed" as const }),
  hydrate: () =>
    Effect.succeed({
      _tag: "Hydrated" as const,
      detail: { description: "Full advert.", applicationUrl: "https://example.com/apply" },
    }),
};

describe("Acquisition Live layer", () => {
  it("resolves the tier from the catalogue and delegates to the matching registration", async () => {
    const registrations: ReadonlyArray<Registration> = [{ tier: "Feed", adapter: feedAdapter }];

    const page = await Effect.runPromise(
      Effect.provide(
        Acquisition.use((acquisition) =>
          acquisition.page("arbeidsplassen-nav" as PlatformId, "cursor"),
        ),
        Layer.provideMerge(layer(registrations), catalogOf([entry()])),
      ),
    );

    expect(page.cursor).toBe("next");
  });

  it("hydrate resolves the tier from the catalogue exactly like page does", async () => {
    const registrations: ReadonlyArray<Registration> = [{ tier: "Feed", adapter: feedAdapter }];

    const outcome = await Effect.runPromise(
      Effect.provide(
        Acquisition.use((acquisition) =>
          acquisition.hydrate("arbeidsplassen-nav" as PlatformId, "ext-1"),
        ),
        Layer.provideMerge(layer(registrations), catalogOf([entry()])),
      ),
    );

    expect(outcome).toEqual({
      _tag: "Hydrated",
      detail: { description: "Full advert.", applicationUrl: "https://example.com/apply" },
    });
  });

  it("fails with AdapterUnavailable for a platform the catalogue has no entry for", async () => {
    const registrations: ReadonlyArray<Registration> = [{ tier: "Feed", adapter: feedAdapter }];

    const exit = await Effect.runPromiseExit(
      Effect.provide(
        Acquisition.use((acquisition) => acquisition.page("nonexistent" as PlatformId, "cursor")),
        Layer.provideMerge(layer(registrations), catalogOf([])),
      ),
    );

    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      expect(String(exit.cause)).toContain("AdapterUnavailable");
    }
  });

  it("fails with AdapterUnavailable for a catalogued tier with no registered adapter", async () => {
    const registrations: ReadonlyArray<Registration> = [{ tier: "Feed", adapter: feedAdapter }];
    const scriptedEntry = entry({
      id: "example-careers" as PlatformId,
      tier: { _tag: "Scripted" },
    });

    const exit = await Effect.runPromiseExit(
      Effect.provide(
        Acquisition.use((acquisition) =>
          acquisition.page("example-careers" as PlatformId, "cursor"),
        ),
        Layer.provideMerge(layer(registrations), catalogOf([scriptedEntry])),
      ),
    );

    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      expect(String(exit.cause)).toContain("AdapterUnavailable");
    }
  });
});
