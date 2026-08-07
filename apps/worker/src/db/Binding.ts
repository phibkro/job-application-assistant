/**
 * The value shapes D1 actually accepts on a bound parameter.
 *
 * Every write in this migration crosses this boundary exactly once (through
 * {@link toBindings}), which is what makes the two D1 defects from the
 * previous implementation structurally impossible here rather than merely
 * fixed: there is nowhere else a binding could originate.
 */
export type Bindable = string | number | null;

/**
 * Normalizes one value for a D1 bind parameter.
 *
 * **Why `undefined` becomes `null`.** D1 rejects a JavaScript `undefined`
 * binding outright (a thrown "D1_TYPE_ERROR", not a stored NULL). An absent
 * `Option.none` field, encoded by `Schema.OptionFromNullOr`, already arrives
 * here as `null` — but a caller that skips a struct key, or a test fixture
 * built with `Partial<...>`, produces `undefined` instead. Coalescing both to
 * `null` here means every absent value reaches D1 as the one representation
 * it accepts, regardless of which shape produced the absence.
 *
 * **Why `bigint` is rejected outright rather than truncated.** D1 also
 * rejects `bigint` bindings. None of this schema's fields are declared wide
 * enough to need 64-bit precision (`Sequence` and `expiresAt` are plain
 * `Schema.Number`), so a `bigint` reaching this boundary is a caller bypassing
 * the domain schema, not a value the schema produced. Silently narrowing it
 * with `Number(value)` would risk a quiet precision loss for exactly the
 * class of value someone reached for `bigint` to avoid; refusing it is the
 * loud failure that surfaces the bypass instead of shipping it.
 */
export const normalizeBinding = (value: unknown): Bindable => {
  if (value === undefined || value === null) return null;
  if (typeof value === "string" || typeof value === "number") return value;
  if (typeof value === "bigint") {
    throw new TypeError(
      `bigint binding ${value.toString()} is not representable — D1 rejects bigint outright, and no ` +
        "column in this schema is declared to need 64-bit precision; encode to a Number upstream",
    );
  }
  if (typeof value === "boolean") {
    throw new TypeError(
      `boolean binding ${String(value)} reached the D1 boundary unencoded — ` +
        "Model.BooleanSqlite must convert it to 0/1 before it gets here",
    );
  }
  throw new TypeError(
    `binding of type ${typeof value} is not representable in D1: ${String(value)}`,
  );
};

/**
 * Picks values from an encoded row in column order, normalizing each one.
 *
 * Column order matters: it must match the `?` placeholders in the generated
 * SQL text, and that text is built from the same `columns` array (see
 * `Sql.ts`), so the two can never drift relative to each other.
 */
export const toBindings = (
  row: Readonly<Record<string, unknown>>,
  columns: ReadonlyArray<string>,
): ReadonlyArray<Bindable> =>
  columns.map((column) =>
    // `Object.hasOwn` rather than `row[column]` alone: a column name that
    // collides with an inherited `Object.prototype` member (e.g. a value
    // literally named "constructor") would otherwise silently bind that
    // prototype's function instead of the missing value — caught by the
    // property test below, which found exactly this counterexample.
    normalizeBinding(Object.hasOwn(row, column) ? row[column] : undefined),
  );

/**
 * ```ts import.meta.vitest
 * // The defect this function exists to make unrepresentable: an absent
 * // field must cross as SQL NULL, never as the `undefined` D1 rejects.
 * normalizeBinding(undefined) // => null
 * normalizeBinding(null) // => null
 * normalizeBinding("x") // => "x"
 * normalizeBinding(3) // => 3
 * ```
 */
if (import.meta.vitest) {
  const { it, expect } = import.meta.vitest;

  it("documents the undefined-to-null rule truthfully", () => {
    expect(normalizeBinding(undefined)).toBe(null);
    expect(normalizeBinding(null)).toBe(null);
    expect(normalizeBinding("x")).toBe("x");
    expect(normalizeBinding(3)).toBe(3);
  });
}
