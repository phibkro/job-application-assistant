import { describe, expect, it } from "vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import { Freshness } from "@job-index/domain/Freshness";
import type { Sequence } from "@job-index/domain/Ids";
import { runTest as run } from "../TestLayer.ts";
import * as FreshnessRepo from "./Freshness.ts";

const now = DateTime.nowUnsafe();

const freshness = (seenThrough: number) =>
  new Freshness({
    profileId: "profile-1" as never,
    seenThrough: seenThrough as Sequence,
    updatedAt: now,
  });

describe("Freshness repository", () => {
  it("upserts the high-water mark and reads it back", async () => {
    const found = await run(
      Effect.gen(function* () {
        yield* FreshnessRepo.upsert(freshness(10));
        return yield* FreshnessRepo.findByProfile("profile-1" as never);
      }),
    );
    expect(found?.seenThrough).toBe(10);
  });

  it("upsert advances the mark rather than accumulating rows — schema has no UNIQUE on profileId", async () => {
    const found = await run(
      Effect.gen(function* () {
        yield* FreshnessRepo.upsert(freshness(10));
        yield* FreshnessRepo.upsert(freshness(25));
        return yield* FreshnessRepo.findByProfile("profile-1" as never);
      }),
    );
    expect(found?.seenThrough).toBe(25);
  });

  it("findByProfile returns undefined before any freshness has been recorded", async () => {
    const found = await run(FreshnessRepo.findByProfile("never-seen" as never));
    expect(found).toBeUndefined();
  });
});
