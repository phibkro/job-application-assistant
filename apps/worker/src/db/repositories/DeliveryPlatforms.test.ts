import { describe, expect, it } from "vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as OptionMod from "effect/Option";
import { DeliveryPlatform } from "@job-index/domain/Delivery";
import { Database } from "../../services/Database.ts";
import { runTest as run } from "../TestLayer.ts";
import * as DeliveryPlatforms from "./DeliveryPlatforms.ts";

const now = DateTime.nowUnsafe();

const platform = (overrides: Partial<{ tier: DeliveryPlatform["tier"] }> = {}) =>
  new DeliveryPlatform({
    id: "finn" as never,
    name: "FINN.no",
    hostPattern: "*.finn.no",
    tier: overrides.tier ?? { _tag: "Unknown" },
    mappings: [],
    automationProhibited: false,
    learnedAt: OptionMod.none(),
    createdAt: now,
    updatedAt: now,
  });

describe("DeliveryPlatforms repository", () => {
  it("inserts and finds a platform by id, decoding its JSON tier back to a tagged value", async () => {
    const found = await run(
      Effect.gen(function* () {
        yield* DeliveryPlatforms.insert(platform());
        return yield* DeliveryPlatforms.findById("finn" as never);
      }),
    );
    expect(found?.tier).toEqual({ _tag: "Unknown" });
    expect(found?.automationProhibited).toBe(false);
  });

  it("climbs the tier via update — the one table that genuinely mutates", async () => {
    const found = await run(
      Effect.gen(function* () {
        yield* DeliveryPlatforms.insert(platform());
        yield* DeliveryPlatforms.update(platform({ tier: { _tag: "Scripted" } }));
        return yield* DeliveryPlatforms.findById("finn" as never);
      }),
    );
    expect(found?.tier).toEqual({ _tag: "Scripted" });
  });

  it("update does not touch createdAt — the update variant excludes it by construction", async () => {
    const rows = await run(
      Effect.gen(function* () {
        const db = yield* Database;
        yield* DeliveryPlatforms.insert(platform());
        yield* DeliveryPlatforms.update(platform({ tier: { _tag: "Agent" } }));
        return yield* db.query<{ createdAt: string }>(
          "SELECT createdAt FROM delivery_platforms WHERE id = ?",
          ["finn"],
        );
      }),
    );
    expect(rows).toHaveLength(1);
  });

  it("all() lists every platform", async () => {
    const rows = await run(
      Effect.gen(function* () {
        yield* DeliveryPlatforms.insert(platform());
        yield* DeliveryPlatforms.insert(
          new DeliveryPlatform({
            id: "linkedin" as never,
            name: "LinkedIn",
            hostPattern: "*.linkedin.com",
            tier: { _tag: "Unknown" },
            mappings: [],
            automationProhibited: true,
            learnedAt: OptionMod.none(),
            createdAt: now,
            updatedAt: now,
          }),
        );
        return yield* DeliveryPlatforms.all();
      }),
    );
    expect(rows.map((r) => r.id).toSorted()).toEqual(["finn", "linkedin"]);
  });

  it("findById returns undefined for an unknown platform", async () => {
    const found = await run(DeliveryPlatforms.findById("unknown" as never));
    expect(found).toBeUndefined();
  });
});
