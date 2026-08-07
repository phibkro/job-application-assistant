import type * as Effect from "effect/Effect";

/**
 * The only thing this package asks a consumer to supply: run a parameterised
 * statement, get rows or nothing back.
 *
 * Deliberately two methods, and deliberately no `transaction`/`atomic`. The
 * SQLite and D1 dialects this package targets have no interactive `BEGIN` an
 * application can hold open across `await` points — D1's Workers binding
 * offers only `batch()`, a fixed list of statements decided in advance — so a
 * port promising an interactive transaction would promise something the
 * target dialect cannot deliver. Every mutation this adapter issues is one
 * statement, using `RETURNING` to read back what changed, which is why one
 * round trip is always enough and no third method is needed.
 */
export interface Executor {
  readonly query: <A>(
    sql: string,
    bindings: ReadonlyArray<unknown>,
  ) => Effect.Effect<ReadonlyArray<A>>;
  readonly run: (sql: string, bindings: ReadonlyArray<unknown>) => Effect.Effect<void>;
}
