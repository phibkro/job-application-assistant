import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { Database } from "../services/Database.ts";
import { normalizeBinding } from "./Binding.ts";
import type { D1Database, D1PreparedStatement } from "./D1.ts";

const bind = (
  statement: D1PreparedStatement,
  bindings: ReadonlyArray<unknown>,
): D1PreparedStatement => statement.bind(...bindings.map(normalizeBinding));

/** One buffered write, captured for later submission via `D1Database.batch`. */
interface BufferedWrite {
  readonly sql: string;
  readonly bindings: ReadonlyArray<unknown>;
}

/**
 * Whether a write issued right now should be buffered for a later `batch()`
 * rather than sent immediately — `undefined` outside any transaction.
 *
 * A `Context.Reference` rather than a `Context.Service`: a Reference has a
 * default and resolves even from an empty context, so reading it never adds
 * a requirement to an effect's `R` — which is what lets `query`/`run` still
 * type as the frozen contract's `Effect.Effect<A>` (no `R`) while remaining
 * genuinely scope-sensitive at runtime. `transaction` overrides it for a
 * nested effect with `Effect.provideService`, exactly the way a
 * dynamically-scoped variable would: the override is visible to any
 * `TxState` lookup structurally inside that effect, however early the
 * `db.run(...)` sub-effects it contains were built — because a `Reference`
 * lookup, like any Context lookup, is resolved against whatever context is
 * active when the fiber actually reaches that node, not when the node's
 * description was constructed. That is what makes this work even for the
 * natural, idiomatic call shape — `const db = yield* Database; ...
 * db.transaction(Effect.gen(function* () { yield* db.run(...) }))` — where
 * `db` was resolved once, outside the transaction, and reused inside it.
 */
const TxState = Context.Reference<{ readonly buffer: Array<BufferedWrite> | undefined }>(
  "@job-index/Db/Live/TxState",
  { defaultValue: () => ({ buffer: undefined }) },
);

/**
 * Builds the `Database` service implementation over a real D1 binding.
 *
 * **The `transaction` gap this closes, and the one it cannot.**
 *
 * `Database.transaction`'s signature — `<A, E, R>(effect) => effect`,
 * documented "all-or-nothing" — reads as a general interactive transaction:
 * wrap arbitrary code, commit or roll back as one unit. Cloudflare D1 does
 * not offer that. Its Workers Binding API has no `BEGIN`/`COMMIT` for
 * application code; the only atomic primitive is `D1Database.batch()`, which
 * takes a list of *already-bound* prepared statements and commits or rolls
 * back that fixed list as one SQLite transaction. (Confirmed against
 * Cloudflare's D1 docs, 2026-08: "Batched statements are SQL transactions...
 * each statement in the list will execute and commit, sequentially,
 * non-concurrently" — there is no interactive-transaction primitive above
 * that.) This is a genuine gap between what the frozen contract's type
 * signature promises and what the real binding can do; it is documented here
 * rather than silently papered over, per this slot's brief.
 *
 * The realization below is the closest correct approximation: while the
 * wrapped effect runs, `run()` (writes) are buffered instead of executed
 * immediately; if the effect succeeds, every buffered write is submitted in
 * one `batch()` call, atomically. If the effect fails or dies, the buffer is
 * simply dropped — nothing was ever sent, so nothing needs to be undone. That
 * is genuinely correct all-or-nothing behaviour for the write-only case the
 * domain actually needs it for (the outbox: "writing an event with its
 * cause", per `Database.ts`'s own docstring).
 *
 * What it does **not** support: a `query()` (read) issued *inside* a
 * transaction never observes a `run()` issued earlier in the *same*
 * transaction, because that write has not been sent to D1 yet — reads still
 * go straight to the live database. A caller that reads its own write inside
 * one `transaction` block will silently see pre-transaction state on this
 * layer. The `Sqlite.ts` test layer has no such restriction (real
 * `BEGIN`/`COMMIT`), so this divergence will not show up in a test written
 * only against `layerSqlite` — anyone adding a read-modify-write transaction
 * should know to check it against this layer's semantics too, or better,
 * avoid the pattern and issue the read before the transaction starts.
 */
const build = (d1: D1Database): Context.Service.Shape<typeof Database> => {
  const realQuery = <A>(
    sql: string,
    bindings: ReadonlyArray<unknown>,
  ): Effect.Effect<ReadonlyArray<A>> =>
    Effect.tryPromise(() => bind(d1.prepare(sql), bindings).all<A>()).pipe(
      Effect.map((result) => result.results),
      Effect.orDie,
    );

  const realRun = (sql: string, bindings: ReadonlyArray<unknown>): Effect.Effect<void> =>
    Effect.tryPromise(() => bind(d1.prepare(sql), bindings).run()).pipe(
      Effect.asVoid,
      Effect.orDie,
    );

  const commitBuffer = (buffer: ReadonlyArray<BufferedWrite>): Effect.Effect<void> =>
    buffer.length === 0
      ? Effect.void
      : Effect.tryPromise(() =>
          d1.batch(buffer.map((w) => bind(d1.prepare(w.sql), w.bindings))),
        ).pipe(Effect.asVoid, Effect.orDie);

  const query = <A>(
    sql: string,
    bindings: ReadonlyArray<unknown>,
  ): Effect.Effect<ReadonlyArray<A>> => realQuery<A>(sql, bindings);

  const run = (sql: string, bindings: ReadonlyArray<unknown>): Effect.Effect<void> =>
    Effect.flatMap(TxState, (state) =>
      state.buffer === undefined
        ? realRun(sql, bindings)
        : Effect.sync(() => {
            state.buffer?.push({ sql, bindings });
          }),
    );

  const transaction = <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
    Effect.flatMap(TxState, (outer): Effect.Effect<A, E, R> =>
      outer.buffer !== undefined
        ? // Already inside an outer transaction: share its buffer rather than
          // opening (and prematurely committing) a second one.
          effect
        : Effect.gen(function* () {
            const buffer: Array<BufferedWrite> = [];
            const result = yield* Effect.provideService(effect, TxState, { buffer });
            yield* commitBuffer(buffer);
            return result;
          }),
    );

  return { query, run, transaction };
};

/**
 * The production `Database` layer, built from a live D1 binding
 * (`env.DB` inside a Worker's fetch handler). A factory rather than a bare
 * `Layer` constant because the binding only exists per-request — there is no
 * module-scope value to close over.
 */
export const layer = (d1: D1Database): Layer.Layer<Database> => Layer.succeed(Database, build(d1));
