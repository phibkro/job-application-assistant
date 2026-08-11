import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import { Database } from "../services/Database.ts";
import { makeFakeD1 } from "./FakeD1.ts";
import { layer } from "./Live.ts";

/**
 * Pins the D1-specific behaviour `Sqlite.ts`'s tests cannot: that `atomic`
 * reaches for `batch()` — D1's only atomicity primitive — and sends the whole
 * list in a single call, while an ordinary `run` goes straight out.
 */

const runWith = <A>(d1: ReturnType<typeof makeFakeD1>, effect: Effect.Effect<A, never, Database>) =>
  Effect.runPromise(Effect.provide(effect, layer(d1)));

describe("Live layer", () => {
  it("writes immediately outside a batch, without touching batch()", async () => {
    const d1 = makeFakeD1();
    const rows = await runWith(
      d1,
      Effect.gen(function* () {
        const db = yield* Database;
        yield* db.run(
          "INSERT INTO freshness (profileId, seenThrough, updatedAt) VALUES (?, ?, ?)",
          ["p1", 3, "2026-01-01T00:00:00.000Z"],
        );
        return yield* db.query("SELECT profileId FROM freshness WHERE profileId = ?", ["p1"]);
      }),
    );
    expect(rows).toHaveLength(1);
    expect(d1.batchCalls).toEqual([]);
  });

  it("sends every write of one atomic unit in exactly one batch() call", async () => {
    const d1 = makeFakeD1();
    await runWith(
      d1,
      Effect.gen(function* () {
        const db = yield* Database;
        yield* db.atomic([
          {
            sql: "INSERT INTO freshness (profileId, seenThrough, updatedAt) VALUES (?, ?, ?)",
            bindings: ["p1", 1, "2026-01-01T00:00:00.000Z"],
          },
          {
            sql: "INSERT INTO subscriptions (profileId, tier, updatedAt) VALUES (?, ?, ?)",
            bindings: ["p1", '{"_tag":"Free"}', "2026-01-01T00:00:00.000Z"],
          },
        ]);
      }),
    );
    expect(d1.batchCalls).toEqual([2]);
  });

  it("commits the whole list, so both writes are readable afterwards", async () => {
    const d1 = makeFakeD1();
    const rows = await runWith(
      d1,
      Effect.gen(function* () {
        const db = yield* Database;
        yield* db.atomic([
          {
            sql: "INSERT INTO freshness (profileId, seenThrough, updatedAt) VALUES (?, ?, ?)",
            bindings: ["p1", 1, "2026-01-01T00:00:00.000Z"],
          },
          {
            sql: "UPDATE freshness SET seenThrough = ? WHERE profileId = ?",
            bindings: [4, "p1"],
          },
        ]);
        return yield* db.query<{ seenThrough: number }>(
          "SELECT seenThrough FROM freshness WHERE profileId = ?",
          ["p1"],
        );
      }),
    );
    expect(rows[0]?.seenThrough).toBe(4);
  });

  it("an empty list is a no-op, not an empty batch: a sweep with nothing to write is normal", async () => {
    const d1 = makeFakeD1();
    await runWith(
      d1,
      Effect.gen(function* () {
        const db = yield* Database;
        yield* db.atomic([]);
      }),
    );
    expect(d1.batchCalls).toEqual([]);
  });
  it("returns D1's changed-row count for compare-and-swap writes", async () => {
    const d1 = makeFakeD1();
    const counts = await runWith(
      d1,
      Effect.gen(function* () {
        const db = yield* Database;
        const inserted = yield* db.runAffected(
          "INSERT INTO freshness (profileId, seenThrough, updatedAt) VALUES (?, ?, ?)",
          ["p1", 1, "2026-01-01T00:00:00.000Z"],
        );
        const matched = yield* db.runAffected(
          "UPDATE freshness SET seenThrough = ? WHERE profileId = ?",
          [2, "p1"],
        );
        const missed = yield* db.runAffected(
          "UPDATE freshness SET seenThrough = ? WHERE profileId = ?",
          [3, "missing"],
        );
        return [inserted, matched, missed];
      }),
    );
    expect(counts).toEqual([1, 1, 0]);
  });
});
