import type * as Effect from "effect/Effect";
import * as Context from "effect/Context";

/**
 * D1 access. The only module that knows SQL.
 *
 * Deliberately narrow: statement plus bindings, returning rows. Whether an SQL
 * layer sits underneath is a decision that must not reach callers, so the
 * interface promises nothing about how the query is built.
 */
export class Database extends Context.Service<
  Database,
  {
    readonly query: <A>(
      sql: string,
      bindings: ReadonlyArray<unknown>,
    ) => Effect.Effect<ReadonlyArray<A>>;
    readonly run: (sql: string, bindings: ReadonlyArray<unknown>) => Effect.Effect<void>;
    /** All-or-nothing. The outbox depends on writing an event with its cause. */
    readonly transaction: <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>;
  }
>()("@job-index/Database") {}
