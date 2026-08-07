import type { Database } from "bun:sqlite";
import * as Effect from "effect/Effect";
import type { Executor } from "../Executor.ts";

/**
 * A real `bun:sqlite` engine behind `Executor`, for this package's own
 * tests. Not part of the published surface — a consumer's own `Database` (or
 * the `sql-client` binding) is the actual implementation; this exists so the
 * conformance suite runs against a real SQL engine rather than a mock.
 */
export const bunSqliteExecutor = (db: Database): Executor => ({
  query: <A>(sql: string, bindings: ReadonlyArray<unknown>) =>
    Effect.sync(() => db.query(sql).all(...bindings.map((b) => b ?? null)) as ReadonlyArray<A>),
  run: (sql: string, bindings: ReadonlyArray<unknown>) =>
    Effect.sync(() => {
      db.query(sql).run(...bindings.map((b) => b ?? null));
    }),
});
