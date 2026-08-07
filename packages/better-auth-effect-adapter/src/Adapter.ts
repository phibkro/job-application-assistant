import { createAdapterFactory, type DBAdapterDebugLogOption } from "better-auth/adapters";
import * as Effect from "effect/Effect";
import type { Executor } from "./Executor.ts";
import { renderSchema } from "./Migrate.ts";
import { buildWhere, type CleanedWhere } from "./Where.ts";

export interface EffectAdapterConfig {
  /** Table names in the schema are plural (`users` instead of `user`). @default false */
  readonly usePlural?: boolean;
  readonly debugLogs?: DBAdapterDebugLogOption;
}

const perform = <A>(effect: Effect.Effect<A>): Promise<A> => Effect.runPromise(effect);

/**
 * A Better Auth database adapter over any `Executor` — SQLite and D1 syntax
 * only (see the README's dialect section).
 *
 * Every mutation reads back what it changed through `RETURNING` rather than
 * trusting a driver's affected-row count, because `Executor` exposes only
 * `query`/`run` (see `Executor.ts` for why): `RETURNING` turns "how many rows
 * did that touch" into an ordinary query result, so `updateMany`/`deleteMany`
 * never need a third primitive to answer it.
 */
export const effectAdapter = (executor: Executor, config: EffectAdapterConfig = {}) =>
  createAdapterFactory({
    config: {
      adapterId: "effect-sql",
      adapterName: "Effect SQL Adapter",
      usePlural: config.usePlural ?? false,
      debugLogs: config.debugLogs ?? false,
      supportsJSON: false,
      supportsDates: false,
      supportsBooleans: false,
      supportsArrays: false,
      // Honest, not aspirational: this adapter never generates an id itself
      // (SQLite `AUTOINCREMENT`/`serial`), so a caller who turns on
      // `useNumberId` should hit Better Auth's own guard for an
      // unsupported combination rather than silently getting `NULL` ids.
      supportsNumericIds: false,
      supportsUUIDs: false,
      // No interactive `BEGIN` — see `Executor.ts`. The factory's fallback
      // for `incrementOne` runs `findMany` + `updateMany` sequentially
      // against this same adapter instead of inside a real transaction: correct
      // for one caller, not race-safe under concurrent ones. `consumeOne` is
      // implemented natively below precisely to not inherit that gap.
      transaction: false,
    },
    adapter: ({ getFieldName, getDefaultModelName }) => {
      /**
       * `select` arrives as schema-key names (`"email"`), never remapped to
       * the physical column (`"email_address"`) the way `where`/`data`/
       * `update` keys already are before they reach a `CustomAdapter` — the
       * factory maps those, but not `select` (verified against the factory
       * source, not assumed). Mapping it here, rather than trusting it to be
       * a column name already, is what keeps a `fieldName` override honest
       * for reads, the same way it already is for writes.
       */
      const columnsFor = (model: string, select?: ReadonlyArray<string>): string =>
        select && select.length > 0
          ? select
              .map((field) => getFieldName({ model: getDefaultModelName(model), field }))
              .join(", ")
          : "*";

      return {
        create: async ({ model, data }) => {
          const columns = Object.keys(data);
          const sql = `INSERT INTO ${model} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`;
          await perform(
            executor.run(
              sql,
              columns.map((column) => data[column]),
            ),
          );
          return data;
        },
        update: async <T>({
          model,
          where,
          update,
        }: {
          model: string;
          where: CleanedWhere[];
          update: T;
        }): Promise<T | null> => {
          if (where.length === 0) return null;
          const clause = buildWhere(where);
          // `T` is caller-chosen and opaque to this adapter — it only ever
          // reads it back as the row `RETURNING` produced, never constructs
          // one, so treating its own keys as `Record<string, unknown>` here
          // is a safe narrowing, not an unchecked assumption about `T`'s shape.
          const record = update as Record<string, unknown>;
          const columns = Object.keys(record);
          if (columns.length === 0) {
            const rows = await perform(
              executor.query<T>(
                `SELECT * FROM ${model} WHERE ${clause.sql} LIMIT 1`,
                clause.bindings,
              ),
            );
            return rows[0] ?? null;
          }
          const sql = `UPDATE ${model} SET ${columns.map((column) => `${column} = ?`).join(", ")} WHERE ${clause.sql} RETURNING *`;
          const bindings = [...columns.map((column) => record[column]), ...clause.bindings];
          const rows = await perform(executor.query<T>(sql, bindings));
          return rows[0] ?? null;
        },
        updateMany: async ({ model, where, update }) => {
          const columns = Object.keys(update);
          if (columns.length === 0) return 0;
          const clause = buildWhere(where);
          const sql = `UPDATE ${model} SET ${columns.map((column) => `${column} = ?`).join(", ")} WHERE ${clause.sql} RETURNING 1`;
          const bindings = [...columns.map((column) => update[column]), ...clause.bindings];
          const rows = await perform(executor.query(sql, bindings));
          return rows.length;
        },
        delete: async ({ model, where }) => {
          const clause = buildWhere(where);
          await perform(executor.run(`DELETE FROM ${model} WHERE ${clause.sql}`, clause.bindings));
        },
        deleteMany: async ({ model, where }) => {
          const clause = buildWhere(where);
          const rows = await perform(
            executor.query(`DELETE FROM ${model} WHERE ${clause.sql} RETURNING 1`, clause.bindings),
          );
          return rows.length;
        },
        // Native, unlike `incrementOne`: a single `DELETE ... RETURNING` is one
        // atomic statement, so two callers racing the same row cannot both
        // receive it. That guarantee is exactly what single-use credentials
        // (verification tokens, one-time codes) depend on.
        consumeOne: async <T>({
          model,
          where,
        }: {
          model: string;
          where: CleanedWhere[];
        }): Promise<T | null> => {
          const clause = buildWhere(where);
          const sql = `DELETE FROM ${model} WHERE id = (SELECT id FROM ${model} WHERE ${clause.sql} LIMIT 1) RETURNING *`;
          const rows = await perform(executor.query<T>(sql, clause.bindings));
          return rows[0] ?? null;
        },
        // `select` is documented as a read-efficiency hint the factory
        // re-applies itself, but `findMany`'s own output transform (as of
        // better-auth 1.6.26) does not actually re-narrow to it — verified by
        // reading `@better-auth/core`'s factory, not assuming the guide's
        // prose covers every call site — so both methods honour it directly.
        findOne: async <T>({
          model,
          where,
          select,
        }: {
          model: string;
          where: CleanedWhere[];
          select?: string[];
        }): Promise<T | null> => {
          const clause = buildWhere(where);
          const columns = columnsFor(model, select);
          const rows = await perform(
            executor.query<T>(
              `SELECT ${columns} FROM ${model} WHERE ${clause.sql} LIMIT 1`,
              clause.bindings,
            ),
          );
          return rows[0] ?? null;
        },
        findMany: async <T>({
          model,
          where,
          limit,
          select,
          sortBy,
          offset,
        }: {
          model: string;
          where?: CleanedWhere[];
          limit: number;
          select?: string[];
          sortBy?: { field: string; direction: "asc" | "desc" };
          offset?: number;
        }): Promise<T[]> => {
          const clause = buildWhere(where ?? []);
          const columns = columnsFor(model, select);
          const order = sortBy
            ? ` ORDER BY ${sortBy.field} ${sortBy.direction === "desc" ? "DESC" : "ASC"}`
            : "";
          const paging = offset !== undefined ? " LIMIT ? OFFSET ?" : " LIMIT ?";
          const bindings =
            offset !== undefined
              ? [...clause.bindings, limit, offset]
              : [...clause.bindings, limit];
          const rows = await perform(
            executor.query<T>(
              `SELECT ${columns} FROM ${model} WHERE ${clause.sql}${order}${paging}`,
              bindings,
            ),
          );
          return [...rows];
        },
        count: async ({ model, where }) => {
          const clause = buildWhere(where ?? []);
          const rows = await perform(
            executor.query<{ count: number }>(
              `SELECT COUNT(*) AS count FROM ${model} WHERE ${clause.sql}`,
              clause.bindings,
            ),
          );
          return rows[0]?.count ?? 0;
        },
        createSchema: async ({ tables, file }) => ({
          code: renderSchema(tables),
          path: file ?? "schema.sql",
          overwrite: true,
        }),
      };
    },
  });
