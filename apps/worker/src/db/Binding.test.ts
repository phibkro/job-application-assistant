import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import { normalizeBinding, toBindings } from "./Binding.ts";

/**
 * The rule that cost two production defects: D1 rejects `undefined` and
 * rejects `bigint`. Stated as laws — true for every input, not just the ones
 * a hand-written test happened to think of — because that is exactly the
 * class of input an example-based test missed the first two times.
 */

const arbJsSafeInteger = fc.integer({ min: Number.MIN_SAFE_INTEGER, max: Number.MAX_SAFE_INTEGER });

/** Values a schema-encoded row is expected to hand this boundary. */
const arbBindableInput = fc.oneof(
  fc.constant(undefined),
  fc.constant(null),
  fc.string(),
  arbJsSafeInteger,
);

describe("normalizeBinding", () => {
  it("never produces undefined, for any value a row can legitimately hold", () => {
    fc.assert(
      fc.property(arbBindableInput, (value) => {
        expect(normalizeBinding(value)).not.toBe(undefined);
      }),
    );
  });

  it("collapses both absence shapes — missing key and explicit undefined — to SQL NULL", () => {
    fc.assert(
      fc.property(fc.constantFrom(undefined, null), (value) => {
        expect(normalizeBinding(value)).toBe(null);
      }),
    );
  });

  it("passes strings and numbers through unchanged", () => {
    fc.assert(
      fc.property(fc.oneof(fc.string(), arbJsSafeInteger), (value) => {
        expect(normalizeBinding(value)).toBe(value);
      }),
    );
  });

  it("rejects bigint outright — no column in this schema is declared wide enough to need it", () => {
    fc.assert(
      fc.property(fc.bigInt(), (value) => {
        expect(() => normalizeBinding(value)).toThrow(TypeError);
      }),
    );
  });

  it("rejects boolean — BooleanSqlite must have encoded it to 0/1 before this boundary", () => {
    fc.assert(
      fc.property(fc.boolean(), (value) => {
        expect(() => normalizeBinding(value)).toThrow(TypeError);
      }),
    );
  });
});

describe("toBindings", () => {
  it("orders values by the given column list, independent of the row's own key order", () => {
    const row = { b: 2, a: 1, c: undefined };
    expect(toBindings(row, ["a", "b", "c"])).toEqual([1, 2, null]);
    expect(toBindings(row, ["c", "a"])).toEqual([null, 1]);
  });

  it("never lets a missing column reach the output as undefined", () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1 }), { minLength: 1, maxLength: 5 }),
        (columns) => {
          const bindings = toBindings({}, columns);
          expect(bindings.every((b) => b !== undefined)).toBe(true);
          expect(bindings).toEqual(columns.map(() => null));
        },
      ),
    );
  });
});
