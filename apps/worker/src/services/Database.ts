import type * as Effect from "effect/Effect";
import * as Context from "effect/Context";

/** One statement and its bindings, ready to send. */
export interface Write {
  readonly sql: string;
  readonly bindings: ReadonlyArray<unknown>;
}

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
    /**
     * Run one statement and return the number of rows it changed.
     *
     * Callers use this for compare-and-swap writes: a zero means the
     * owner/key/version predicate no longer matched, so the caller must
     * report a typed stale update rather than claiming success.
     */
    readonly runAffected: (sql: string, bindings: ReadonlyArray<unknown>) => Effect.Effect<number>;
    /**
     * All-or-nothing, over a list of writes decided in advance.
     *
     * A list rather than "wrap this effect", because D1 has no interactive
     * transaction: the Workers Binding API offers no `BEGIN` for application
     * code, and `D1Database.batch()` — a fixed list of prepared statements
     * committed as one SQLite transaction — is the only atomic primitive there
     * is. An effect-wrapping signature promised semantics the production
     * binding cannot deliver, and the shape of that promise is what made the
     * bug writable: read, write, then read again expecting to see the write.
     * Against SQLite in tests that passes; against D1 the second read misses,
     * because the write is still buffered. Tests stronger than production is
     * the worst direction for a gap to run in.
     *
     * So reads happen first and decide what to write; the writes go together.
     * Callers that needed the other shape were, in every case, better off
     * computing the whole write set from one read — which is the functional
     * core the rest of this codebase is already written as.
     */
    readonly atomic: (writes: ReadonlyArray<Write>) => Effect.Effect<void>;
  }
>()("@job-index/Database") {}
