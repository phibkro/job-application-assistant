import { Database as BunSqlite } from "bun:sqlite";
import * as node_fs from "node:fs";
import * as node_path from "node:path";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import { Database } from "../services/Database.ts";
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
 * `bun:sqlite` is synchronous end to end, which is what makes `transaction`
 * here strictly stronger than the D1-backed layer's: it can hold an open
 * `BEGIN` across arbitrary application code — including a read that observes
 * an earlier write in the same transaction — because there is no network hop
 * between statements. D1 has no such primitive (see `Live.ts`'s docstring);
 * this layer does not share that limitation, so a test written against it
 * proves the domain logic, not D1's constraints.
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

    // All-or-nothing via a real SQL transaction: BEGIN before the wrapped
    // effect, COMMIT on success, ROLLBACK on any failure or defect. The
    // original Exit (error, defect, or interruption) is re-raised unchanged
    // after the rollback so the caller sees exactly what would have happened
    // without the wrapper — `transaction` adds atomicity, not new failure
    // modes, matching the frozen `E` in `Database.transaction`'s signature.
    const transaction = <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
      Effect.flatMap(
        Effect.sync(() => db.exec("BEGIN")),
        () =>
          Effect.flatMap(Effect.exit(effect), (exit) =>
            Effect.flatMap(
              Effect.sync(() => db.exec(Exit.isSuccess(exit) ? "COMMIT" : "ROLLBACK")),
              () =>
                Exit.isSuccess(exit) ? Effect.succeed(exit.value) : Effect.failCause(exit.cause),
            ),
          ),
      );

    return Database.of({ query, run, transaction });
  });
