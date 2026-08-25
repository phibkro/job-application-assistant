import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import type { PlatformId } from "@job-index/domain/Ids";
import { runTest as run } from "../TestLayer.ts";
import * as IngestionGate from "./IngestionGate.ts";

const PLATFORM = "arbeidsplassen-nav" as PlatformId;
const NOW = "2026-08-25T12:00:00.000Z";

/** Six hours before NOW — the default floor's cutoff. */
const CUTOFF = "2026-08-25T06:00:00.000Z";

describe("IngestionGate repository", () => {
  it("seeds an absent row at the epoch and wins the first claim", async () => {
    const won = await run(IngestionGate.claim(PLATFORM, NOW, CUTOFF));
    expect(won).toBe(true);
    const stamp = await run(IngestionGate.find(PLATFORM));
    expect(stamp?.lastAttemptAt).toBe(NOW);
  });

  it("loses a claim inside the floor window without moving the stamp", async () => {
    const result = await run(
      Effect.gen(function* () {
        const first = yield* IngestionGate.claim(PLATFORM, NOW, CUTOFF);
        // Five hours after the winner — still inside the six-hour floor.
        const second = yield* IngestionGate.claim(PLATFORM, "2026-08-25T17:00:00.000Z", CUTOFF);
        const stamp = yield* IngestionGate.find(PLATFORM);
        return { first, second, stamp };
      }),
    );
    expect(result.first).toBe(true);
    expect(result.second).toBe(false);
    expect(result.stamp?.lastAttemptAt).toBe(NOW);
  });

  it("wins again once the stamp ages past the cutoff", async () => {
    const result = await run(
      Effect.gen(function* () {
        yield* IngestionGate.claim(PLATFORM, NOW, CUTOFF);
        // The next gate firing is seven hours later: its own cutoff has
        // moved past the stored stamp, so the guarded UPDATE matches.
        return yield* IngestionGate.claim(
          PLATFORM,
          "2026-08-25T19:00:00.000Z",
          "2026-08-25T13:00:00.000Z",
        );
      }),
    );
    expect(result).toBe(true);
  });

  it("keeps platforms independent — one row per platformId", async () => {
    const OTHER = "finn-jobb" as PlatformId;
    const result = await run(
      Effect.gen(function* () {
        const navWon = yield* IngestionGate.claim(PLATFORM, NOW, CUTOFF);
        const otherWon = yield* IngestionGate.claim(OTHER, NOW, CUTOFF);
        const otherStamp = yield* IngestionGate.find(OTHER);
        return { navWon, otherWon, otherStamp };
      }),
    );
    expect(result.navWon).toBe(true);
    expect(result.otherWon).toBe(true);
    expect(result.otherStamp?.lastAttemptAt).toBe(NOW);
  });

  it("returns undefined before any attempt was ever stamped", async () => {
    const stamp = await run(IngestionGate.find("never-attempted" as PlatformId));
    expect(stamp).toBeUndefined();
  });
});
