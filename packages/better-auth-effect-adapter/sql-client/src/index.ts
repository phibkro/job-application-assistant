import * as Effect from "effect/Effect";
import type { SqlClient } from "effect/unstable/sql/SqlClient";
import type { Executor } from "../../src/Executor.ts";

/**
 * `Executor` over `effect/unstable/sql`'s `SqlClient` — the most reusable
 * binding, since anything already wired to `@effect/sql`'s connection pools
 * (Postgres, MySQL, SQLite, D1) gets this adapter for free.
 *
 * A separate entry point (`better-auth-effect-adapter/sql-client`) rather
 * than a dependency of the package root: the core adapter and its `Where`
 * translation work against nothing but the two-method `Executor` port, and
 * must keep working for a consumer who never installs `effect/unstable/sql`
 * at all — a D1 binding or `bun:sqlite` directly, say. Pulling `SqlClient` in
 * here, behind its own import path, is what keeps that true.
 *
 * `SqlClient.unsafe` fails with a typed `SqlError`; `Executor` promises
 * `never` in its error channel, matching this repository's own `Database`
 * port, which treats a failed statement as a defect rather than a modelled
 * failure — there is no recovery an auth adapter can usefully take mid
 * sign-in. `Effect.orDie` is that boundary made explicit, not a corner cut.
 */
export const executorFromSqlClient = (client: SqlClient): Executor => ({
  query: <A>(sql: string, bindings: ReadonlyArray<unknown>): Effect.Effect<ReadonlyArray<A>> =>
    Effect.orDie(client.unsafe<Record<string, unknown>>(sql, bindings)) as Effect.Effect<
      ReadonlyArray<A>
    >,
  run: (sql: string, bindings: ReadonlyArray<unknown>) =>
    Effect.orDie(Effect.asVoid(client.unsafe(sql, bindings))),
});
