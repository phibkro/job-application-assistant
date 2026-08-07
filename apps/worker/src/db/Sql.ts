import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { toBindings } from "./Binding.ts";
import type { Bindable } from "./Binding.ts";

/**
 * The shared shape of a generated `Model.Class` variant (`select`, `insert`,
 * `update`, ...): a schema whose field NAMES are introspectable at runtime.
 * `scripts/ts/schema.ts` reads the same shape to generate `db/schema.sql` —
 * this is the same fact read a second time, for the same reason: the model is
 * the one place the column list is written down.
 */
export interface Variant<A = unknown> extends Schema.Top {
  readonly fields: Record<string, unknown>;
  readonly Type: A;
}

/** Column names for a variant, in the model's declared order. */
export const columnsOf = (variant: Variant): ReadonlyArray<string> => Object.keys(variant.fields);

/**
 * Decodes one raw database row into a model instance.
 *
 * Dies on a shape mismatch rather than returning a typed failure: a row this
 * schema cannot parse is drift between the stored data and the model that
 * owns it, not a business condition a caller could recover from — and it
 * matches `Database.query`'s own signature (`Effect.Effect<A>`, no error
 * channel), which says the same thing about the SQL boundary.
 */
export const decodeRow =
  <A>(select: Schema.Codec<A, unknown>) =>
  (row: unknown): Effect.Effect<A> =>
    Schema.decodeUnknownEffect(select)(row).pipe(Effect.orDie);

/** Decodes every row in a query result the same way — one row, N times. */
export const decodeRows =
  <A>(select: Schema.Codec<A, unknown>) =>
  (rows: ReadonlyArray<unknown>): Effect.Effect<ReadonlyArray<A>> =>
    Effect.forEach(rows, decodeRow(select));

/**
 * Encodes a model instance into the plain column → value map for one
 * variant. Used for both the `INSERT` and `UPDATE` paths — which columns
 * appear is exactly what the variant (`insert` omits nothing here since no
 * column is `GeneratedByDb`; `update` omits `createdAt`) already decided.
 */
export const encodeVariant =
  <A>(variant: Schema.Codec<A, unknown>) =>
  (value: A): Effect.Effect<Record<string, unknown>> =>
    Schema.encodeEffect(variant)(value).pipe(Effect.orDie) as Effect.Effect<
      Record<string, unknown>
    >;

/** One prepared statement: SQL text plus the bindings in placeholder order. */
export interface Statement {
  readonly sql: string;
  readonly bindings: ReadonlyArray<Bindable>;
}

/**
 * Builds an `INSERT` statement from an encoded row and the target variant's
 * column list — the column list is never retyped by a caller, so it cannot
 * drift from what the model declares.
 */
export const insertStatement = (
  table: string,
  columns: ReadonlyArray<string>,
  encoded: Readonly<Record<string, unknown>>,
): Statement => ({
  sql: `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
  bindings: toBindings(encoded, columns),
});

/**
 * Builds an `UPDATE ... WHERE` statement. `keyColumns` are excluded from the
 * `SET` list (rewriting a row's own key is a different operation, not an
 * update) and supply the `WHERE` clause, taken from the same encoded row so
 * the key values used to find the row and the ones just written can never
 * disagree.
 */
export const updateStatement = (
  table: string,
  columns: ReadonlyArray<string>,
  keyColumns: ReadonlyArray<string>,
  encoded: Readonly<Record<string, unknown>>,
): Statement => {
  const setColumns = columns.filter((c) => !keyColumns.includes(c));
  return {
    sql:
      `UPDATE ${table} SET ${setColumns.map((c) => `${c} = ?`).join(", ")} ` +
      `WHERE ${keyColumns.map((c) => `${c} = ?`).join(" AND ")}`,
    bindings: [...toBindings(encoded, setColumns), ...toBindings(encoded, keyColumns)],
  };
};

/** Builds a `DELETE ... WHERE` statement over an explicit key/value map. */
export const deleteStatement = (
  table: string,
  where: Readonly<Record<string, Bindable>>,
): Statement => {
  const keyColumns = Object.keys(where);
  return {
    sql: `DELETE FROM ${table} WHERE ${keyColumns.map((c) => `${c} = ?`).join(" AND ")}`,
    bindings: toBindings(where, keyColumns),
  };
};

/** Builds a `SELECT * ... WHERE` statement over an explicit key/value map. */
export const selectStatement = (
  table: string,
  where: Readonly<Record<string, Bindable>>,
): Statement => {
  const keyColumns = Object.keys(where);
  const clause =
    keyColumns.length === 0 ? "" : ` WHERE ${keyColumns.map((c) => `${c} = ?`).join(" AND ")}`;
  return { sql: `SELECT * FROM ${table}${clause}`, bindings: toBindings(where, keyColumns) };
};
