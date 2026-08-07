import { Database as BunSqlite } from "bun:sqlite";
import * as node_fs from "node:fs";
import * as node_path from "node:path";
import { normalizeBinding } from "./Binding.ts";
import type { D1Database, D1PreparedStatement } from "./D1.ts";

/** Same generated snapshot `Sqlite.ts` reads — one schema, read twice, never copied. */
const SCHEMA_PATH = node_path.resolve(import.meta.dirname, "../../../../db/schema.sql");

/**
 * A small in-memory fake of the real D1 binding shape (`prepare`/`bind`/
 * `all`/`run`/`batch`), used only to pin `Live.ts`'s batching behaviour —
 * specifically that `batch()` is what `Database.transaction` reaches for,
 * and that it receives every buffered write as one call. It is backed by
 * `bun:sqlite` for real SQL semantics (so a batch actually commits or rolls
 * back atomically, per SQLite's own transaction guarantee for a statement
 * list) rather than being a hand-rolled query interpreter.
 *
 * This is deliberately separate from `Sqlite.ts`'s `layerSqlite`: that one
 * fakes the whole `Database` contract for repository tests; this one fakes
 * only the underlying D1 *binding shape* so `Live.ts`'s D1-specific
 * batching logic — which `layerSqlite` never exercises, since it uses real
 * `BEGIN`/`COMMIT` instead — has something to run against.
 */
export const makeFakeD1 = (): D1Database & { readonly batchCalls: Array<number> } => {
  const db = new BunSqlite(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(node_fs.readFileSync(SCHEMA_PATH, "utf8"));

  const statement = (sql: string, bound: ReadonlyArray<unknown>): D1PreparedStatement => ({
    bind(...values) {
      return statement(sql, values);
    },
    all: async <T>() => ({ results: db.query<T>(sql).all(...bound.map(normalizeBinding)) }),
    run: async () => {
      db.query(sql).run(...bound.map(normalizeBinding));
    },
  });

  const batchCalls: Array<number> = [];

  return {
    batchCalls,
    prepare: (sql: string) => statement(sql, []),
    batch: async (statements) => {
      batchCalls.push(statements.length);
      // Mirrors D1: the whole list commits or rolls back as one SQLite
      // transaction (see D1.ts's docstring for the citation).
      db.exec("BEGIN");
      try {
        // Deliberately sequential, not Promise.all: D1's own docs say batched
        // statements "execute and commit, sequentially, non-concurrently" —
        // parallelizing this fake would misrepresent the exact ordering
        // guarantee it exists to pin (e.g. Answers.upsert's delete-then-insert).
        // eslint-disable-next-line no-await-in-loop
        for (const s of statements) {
          await s.run();
        }
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
      return [];
    },
  };
};
