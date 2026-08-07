import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import { Database } from "../services/Database.ts";
import { layerSqlite } from "./Sqlite.ts";

/**
 * Exercises the frozen `Database` contract against a real SQLite engine
 * running the actual generated schema — not a hand-mocked query stub — so a
 * green result here means the contract's three operations genuinely hold,
 * not merely that a mock was told to behave.
 */

const run = <A>(effect: Effect.Effect<A, never, Database>) =>
  Effect.runPromise(Effect.provide(effect, layerSqlite()));

describe("layerSqlite", () => {
  it("runs the generated schema, so every table from db/schema.sql is queryable", async () => {
    const rows = await run(
      Effect.gen(function* () {
        const db = yield* Database;
        return yield* db.query<{ name: string }>(
          "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
          [],
        );
      }),
    );
    expect(rows.map((r) => r.name)).toEqual([
      "answers",
      "canonical_jobs",
      "delivery_platforms",
      "freshness",
      "judgements",
      "occurrences",
      "principals",
      "profiles",
      "sessions",
      "submissions",
      "subscriptions",
    ]);
  });

  it("writes with run() and reads them back with query()", async () => {
    const rows = await run(
      Effect.gen(function* () {
        const db = yield* Database;
        yield* db.run(
          "INSERT INTO freshness (profileId, seenThrough, updatedAt) VALUES (?, ?, ?)",
          ["profile-1", 5, "2026-01-01T00:00:00.000Z"],
        );
        return yield* db.query<{ profileId: string; seenThrough: number }>(
          "SELECT profileId, seenThrough FROM freshness WHERE profileId = ?",
          ["profile-1"],
        );
      }),
    );
    expect(rows).toEqual([{ profileId: "profile-1", seenThrough: 5 }]);
  });

  it("binds undefined as SQL NULL rather than rejecting it — the trap this layer exists to close", async () => {
    // learnedAt is the schema's one nullable column on delivery_platforms;
    // passing JS `undefined` for it must land as SQL NULL, not throw.
    const rows = await run(
      Effect.gen(function* () {
        const db = yield* Database;
        yield* db.run(
          "INSERT INTO delivery_platforms " +
            "(id, name, hostPattern, tier, automationProhibited, learnedAt, createdAt, updatedAt) " +
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          [
            "p1",
            "Platform",
            "*.example.com",
            '{"_tag":"Unknown"}',
            0,
            undefined,
            "2026-01-01T00:00:00.000Z",
            "2026-01-01T00:00:00.000Z",
          ],
        );
        return yield* db.query<{ learnedAt: string | null }>(
          "SELECT learnedAt FROM delivery_platforms WHERE id = ?",
          ["p1"],
        );
      }),
    );
    expect(rows[0]?.learnedAt).toBe(null);
  });

  it("commits every write in the list", async () => {
    const rows = await run(
      Effect.gen(function* () {
        const db = yield* Database;
        yield* db.atomic([
          {
            sql: "INSERT INTO freshness (profileId, seenThrough, updatedAt) VALUES (?, ?, ?)",
            bindings: ["committed", 1, "2026-01-01T00:00:00.000Z"],
          },
        ]);
        return yield* db.query("SELECT profileId FROM freshness WHERE profileId = ?", [
          "committed",
        ]);
      }),
    );
    expect(rows).toHaveLength(1);
  });

  it("rolls the whole list back when one statement fails, so a partial batch is not observable", async () => {
    const outcome = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const db = yield* Database;
          const exit = yield* Effect.exit(
            db.atomic([
              {
                sql: "INSERT INTO freshness (profileId, seenThrough, updatedAt) VALUES (?, ?, ?)",
                bindings: ["rolled-back", 1, "2026-01-01T00:00:00.000Z"],
              },
              // Same profile twice: PRIMARY KEY (profileId) rejects the second,
              // and the first must not survive it.
              {
                sql: "INSERT INTO freshness (profileId, seenThrough, updatedAt) VALUES (?, ?, ?)",
                bindings: ["rolled-back", 2, "2026-01-01T00:00:00.000Z"],
              },
            ]),
          );
          const rows = yield* db.query("SELECT profileId FROM freshness WHERE profileId = ?", [
            "rolled-back",
          ]);
          return { exit, rowCount: rows.length };
        }),
        layerSqlite(),
      ),
    );
    expect(outcome.exit._tag).toBe("Failure");
    expect(outcome.rowCount).toBe(0);
  });
});
