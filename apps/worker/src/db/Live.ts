import type * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { Database } from "../services/Database.ts";
import type { Write } from "../services/Database.ts";
import { normalizeBinding } from "./Binding.ts";
import type { D1Database, D1PreparedStatement } from "./D1.ts";

const bind = (
  statement: D1PreparedStatement,
  bindings: ReadonlyArray<unknown>,
): D1PreparedStatement => statement.bind(...bindings.map(normalizeBinding));

const changesOf = (result: unknown): number => {
  if (typeof result !== "object" || result === null || !("meta" in result)) return 0;
  const meta = result.meta;
  if (typeof meta !== "object" || meta === null || !("changes" in meta)) return 0;
  const changes = meta.changes;
  return typeof changes === "number" ? changes : 0;
};

/**
 * Builds the `Database` service implementation over a real D1 binding.
 *
 * `atomic` is `D1Database.batch()`, which is the whole story: a list of
 * already-bound prepared statements that D1 commits or rolls back as one
 * SQLite transaction. There is no interactive transaction to approximate —
 * the Workers Binding API has no `BEGIN` for application code (Cloudflare's
 * D1 docs, 2026-08: "Batched statements are SQL transactions... each
 * statement in the list will execute and commit, sequentially,
 * non-concurrently") — and the contract no longer asks for one.
 *
 * An earlier version of this layer did approximate it, by buffering writes
 * issued inside a wrapped effect and flushing them on success. It worked, and
 * it left a trap: a read inside that effect went straight to the live
 * database and could not see the buffered write, while the same code against
 * `layerSqlite` saw it immediately. `Database.atomic` takes a decided list of
 * writes instead, so that difference has nowhere left to hide.
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

  const realRunAffected = (sql: string, bindings: ReadonlyArray<unknown>): Effect.Effect<number> =>
    Effect.tryPromise(() => bind(d1.prepare(sql), bindings).run()).pipe(
      Effect.map(changesOf),
      Effect.orDie,
    );

  // An empty batch is a no-op rather than an error: a sweep that decides
  // nothing needs writing is a normal outcome, not a caller mistake.
  const atomic = (writes: ReadonlyArray<Write>): Effect.Effect<void> =>
    writes.length === 0
      ? Effect.void
      : Effect.tryPromise(() =>
          d1.batch(writes.map((write) => bind(d1.prepare(write.sql), write.bindings))),
        ).pipe(Effect.asVoid, Effect.orDie);

  return { query: realQuery, run: realRun, runAffected: realRunAffected, atomic };
};

/**
 * The production `Database` layer, built from a live D1 binding
 * (`env.DB` inside a Worker's fetch handler). A factory rather than a bare
 * `Layer` constant because the binding only exists per-request — there is no
 * module-scope value to close over.
 */
export const layer = (d1: D1Database): Layer.Layer<Database> => Layer.succeed(Database, build(d1));
