import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type { PlatformId, Sequence } from "@job-index/domain/Ids";
import type { AcquisitionTier, CatalogEntry } from "@job-index/domain/Source";
import { Ingestion } from "../services/Ingestion.ts";
import { SourceCatalog } from "../services/SourceCatalog.ts";
import { scheduledIngestion } from "./scheduled.ts";

const entry = (id: string, tier: AcquisitionTier["_tag"]): CatalogEntry => ({
  id: id as PlatformId,
  platform: id,
  category: "test",
  listingsUrl: `https://example.com/${id}`,
  tier: { _tag: tier } as AcquisitionTier,
  policy: { _tag: "Unreviewed" },
  requiresPremium: tier === "Agent",
  priority: "P1",
  confidence: "high",
  notes: "",
  verifiedAt: "2026-08-11",
});

const report = {
  pages: 0,
  observations: 0,
  canonicalChanges: 0,
  cursorBefore: "",
  cursorAfter: "",
  highestSequence: 0 as Sequence,
  stoppedReason: "reached tail",
  durationMs: 0,
};

describe("scheduledIngestion", () => {
  it("collects only the tier implemented by this deployment", async () => {
    const agent = entry("agent-only", "Agent");
    const nav = entry("arbeidsplassen-nav", "Feed");
    const collected: Array<PlatformId> = [];
    let requestedTier: AcquisitionTier | undefined;

    const layer = Layer.mergeAll(
      Layer.succeed(
        SourceCatalog,
        SourceCatalog.of({
          list: (tier) => {
            requestedTier = tier;
            return Effect.succeed(tier?._tag === "Feed" ? [nav] : [agent, nav]);
          },
        }),
      ),
      Layer.succeed(
        Ingestion,
        Ingestion.of({
          collect: (platform) =>
            Effect.sync(() => {
              collected.push(platform);
              return report;
            }),
        }),
      ),
    );

    await Effect.runPromise(scheduledIngestion.pipe(Effect.provide(layer)));

    expect(requestedTier).toEqual({ _tag: "Feed" });
    expect(collected).toEqual([nav.id]);
  });
});
