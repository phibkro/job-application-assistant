import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import { Database } from "../services/Database.ts";
import { makeFakeD1 } from "./FakeD1.ts";
import { layer } from "./Live.ts";

/**
 * Pins the D1-specific behaviour `Sqlite.ts`'s tests cannot: that
 * `transaction` reaches for `batch()` (D1's real atomicity primitive) rather
 * than something D1 does not support, and the documented divergence from
 * `layerSqlite` — a read inside a transaction does not see an earlier write
 * in the same transaction, because the write has not reached D1 yet.
 */

const runWith = <A>(d1: ReturnType<typeof makeFakeD1>, effect: Effect.Effect<A, never, Database>) =>
  Effect.runPromise(Effect.provide(effect, layer(d1)));

describe("Live layer", () => {
  it("writes immediately outside a transaction, without touching batch()", async () => {
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

  it("submits every buffered write in exactly one batch() call on success", async () => {
    const d1 = makeFakeD1();
    await runWith(
      d1,
      Effect.gen(function* () {
        const db = yield* Database;
        yield* db.transaction(
          Effect.gen(function* () {
            yield* db.run(
              "INSERT INTO freshness (profileId, seenThrough, updatedAt) VALUES (?, ?, ?)",
              ["p1", 1, "2026-01-01T00:00:00.000Z"],
            );
            yield* db.run(
              "INSERT INTO subscriptions (profileId, tier, updatedAt) VALUES (?, ?, ?)",
              ["p1", '{"_tag":"Free"}', "2026-01-01T00:00:00.000Z"],
            );
          }),
        );
      }),
    );
    expect(d1.batchCalls).toEqual([2]);
  });

  it("drops the buffer instead of calling batch() when the wrapped effect fails — nothing was ever sent", async () => {
    class Boom {
      readonly _tag = "Boom";
    }
    const d1 = makeFakeD1();
    const exit = await Effect.runPromiseExit(
      Effect.provide(
        Effect.gen(function* () {
          const db = yield* Database;
          return yield* db.transaction(
            Effect.gen(function* () {
              yield* db.run(
                "INSERT INTO freshness (profileId, seenThrough, updatedAt) VALUES (?, ?, ?)",
                ["p1", 1, "2026-01-01T00:00:00.000Z"],
              );
              return yield* Effect.fail(new Boom());
            }),
          );
        }),
        layer(d1),
      ),
    );
    expect(exit._tag).toBe("Failure");
    expect(d1.batchCalls).toEqual([]);

    const rows = await runWith(
      d1,
      Effect.gen(function* () {
        const db = yield* Database;
        return yield* db.query("SELECT profileId FROM freshness WHERE profileId = ?", ["p1"]);
      }),
    );
    expect(rows).toHaveLength(0);
  });

  it(
    "documents the real divergence from layerSqlite: a read inside a transaction does not see " +
      "an earlier write in the same transaction, because D1 has no interactive BEGIN — the write is " +
      "only buffered until the transaction commits via batch()",
    async () => {
      const d1 = makeFakeD1();
      const seenDuringTransaction = await runWith(
        d1,
        Effect.gen(function* () {
          const db = yield* Database;
          return yield* db.transaction(
            Effect.gen(function* () {
              yield* db.run(
                "INSERT INTO freshness (profileId, seenThrough, updatedAt) VALUES (?, ?, ?)",
                ["p1", 9, "2026-01-01T00:00:00.000Z"],
              );
              const rows = yield* db.query("SELECT profileId FROM freshness WHERE profileId = ?", [
                "p1",
              ]);
              return rows.length;
            }),
          );
        }),
      );
      expect(seenDuringTransaction).toBe(0);

      const rowsAfterCommit = await runWith(
        d1,
        Effect.gen(function* () {
          const db = yield* Database;
          return yield* db.query("SELECT profileId FROM freshness WHERE profileId = ?", ["p1"]);
        }),
      );
      expect(rowsAfterCommit).toHaveLength(1);
    },
  );
});
