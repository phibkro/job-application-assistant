import { Database as BunSqlite } from "bun:sqlite";
import * as node_fs from "node:fs";
import * as node_path from "node:path";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { Database } from "../services/Database.ts";
import type { Write } from "../services/Database.ts";
import { normalizeBinding } from "./Binding.ts";

/**
 * `db/schema.sql` is read from disk rather than re-declared here: it is
 * already generated from the domain models by `scripts/ts/schema.ts`, and a
 * second, hand-copied schema string is exactly the two-copies-can-disagree
 * state that file's own header warns against ("Nothing else may edit this
 * file" — reading it is not editing it).
 */
const SCHEMA_PATH = node_path.resolve(import.meta.dirname, "../../../../db/schema.sql");

const bind = (bindings: ReadonlyArray<unknown>) => bindings.map(normalizeBinding);

/**
 * A `Database` layer over a real SQLite engine (`bun:sqlite`), for tests.
 *
 * Not a hand-rolled query stub: `bun:sqlite` is a real SQL engine running the
 * real generated schema, so a repository test here exercises actual SQL
 * (constraint checks, `json_` functions if a future query used them, real
 * `BEGIN`/`COMMIT`/`ROLLBACK`) rather than whatever behaviour a mock happened
 * to be told to have.
 *
 * `atomic` is a real `BEGIN`/`COMMIT` around the given writes. It could hold
 * a transaction open across arbitrary application code — `bun:sqlite` is
 * synchronous end to end — but it deliberately does not offer that, because
 * D1 cannot, and a test layer stronger than production is how a passing test
 * hides a live bug. Both layers now implement the same narrow promise.
 */
export const layerSqlite = (location: string = ":memory:"): Layer.Layer<Database> =>
  Layer.sync(Database, () => {
    const db = new BunSqlite(location);
    // D1 enforces foreign keys by default; SQLite does not unless asked.
    // Matching that here means a constraint violation shows up in a fast
    // local test instead of only in production against the real binding.
    db.exec("PRAGMA foreign_keys = ON;");
    db.exec(node_fs.readFileSync(SCHEMA_PATH, "utf8"));

    const query = <A>(
      sql: string,
      bindings: ReadonlyArray<unknown>,
    ): Effect.Effect<ReadonlyArray<A>> =>
      Effect.sync(() => db.query(sql).all(...bind(bindings)) as ReadonlyArray<A>);

    const run = (sql: string, bindings: ReadonlyArray<unknown>): Effect.Effect<void> =>
      Effect.sync(() => {
        db.query(sql).run(...bind(bindings));
      });

    const runAffected = (sql: string, bindings: ReadonlyArray<unknown>): Effect.Effect<number> =>
      Effect.sync(() => {
        const result = db.query(sql).run(...bind(bindings));
        if (typeof result === "object" && result !== null && "changes" in result) {
          const changes = result.changes;
          return typeof changes === "number" ? changes : 0;
        }
        return 0;
      });
    // All-or-nothing over the given list. Every write runs between BEGIN and
    // COMMIT; anything SQLite rejects rolls the whole list back before the
    // defect propagates, so a partial batch is not a state a caller can see.
    const atomic = (writes: ReadonlyArray<Write>): Effect.Effect<void> =>
      writes.length === 0
        ? Effect.void
        : Effect.sync(() => {
            db.exec("BEGIN");
            try {
              for (const write of writes) {
                db.query(write.sql).run(...bind(write.bindings));
              }
              db.exec("COMMIT");
            } catch (cause) {
              db.exec("ROLLBACK");
              throw cause;
            }
          });

    return Database.of({ query, run, runAffected, atomic });
  });
