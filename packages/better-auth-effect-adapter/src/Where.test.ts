import { describe, expect, it } from "vitest";
import { buildWhere, type CleanedWhere } from "./Where.ts";

const clause = (
  partial: Partial<CleanedWhere> & { field: string; value: CleanedWhere["value"] },
): CleanedWhere => ({
  operator: "eq",
  connector: "AND",
  mode: "sensitive",
  ...partial,
});

describe("buildWhere", () => {
  it("empty where matches everything", () => {
    expect(buildWhere([])).toEqual({ sql: "1 = 1", bindings: [] });
  });

  it("parameterises every value — never interpolates it into the SQL text", () => {
    // The defect this guards: a value containing a quote must not be able to
    // alter the emitted SQL. `bindings` is the only place it may appear.
    const injected = "O'Brien'; DROP TABLE user; --";
    const result = buildWhere([clause({ field: "name", value: injected })]);
    expect(result.sql).not.toContain(injected);
    expect(result.sql).toBe("name = ?");
    expect(result.bindings).toEqual([injected]);
  });

  it("eq with null becomes IS NULL, not `= ?`", () => {
    expect(buildWhere([clause({ field: "image", value: null })])).toEqual({
      sql: "image IS NULL",
      bindings: [],
    });
  });

  it("ne with null becomes IS NOT NULL", () => {
    expect(buildWhere([clause({ field: "image", operator: "ne", value: null })])).toEqual({
      sql: "image IS NOT NULL",
      bindings: [],
    });
  });

  it("in/not_in bind every array element", () => {
    expect(buildWhere([clause({ field: "id", operator: "in", value: ["a", "b", "c"] })])).toEqual({
      sql: "id IN (?, ?, ?)",
      bindings: ["a", "b", "c"],
    });
    expect(buildWhere([clause({ field: "id", operator: "not_in", value: ["a"] })])).toEqual({
      sql: "id NOT IN (?)",
      bindings: ["a"],
    });
  });

  it("empty in/not_in never becomes invalid SQL, and matches accordingly", () => {
    expect(buildWhere([clause({ field: "id", operator: "in", value: [] })])).toEqual({
      sql: "0 = 1",
      bindings: [],
    });
    expect(buildWhere([clause({ field: "id", operator: "not_in", value: [] })])).toEqual({
      sql: "1 = 1",
      bindings: [],
    });
  });

  it("contains/starts_with/ends_with never interpret the value as a pattern", () => {
    // A value containing LIKE/regex metacharacters must be matched literally.
    const needle = "50%_off.*";
    expect(buildWhere([clause({ field: "name", operator: "contains", value: needle })])).toEqual({
      sql: "instr(name, ?) > 0",
      bindings: [needle],
    });
    expect(buildWhere([clause({ field: "name", operator: "starts_with", value: needle })])).toEqual(
      {
        sql: "instr(name, ?) = 1",
        bindings: [needle],
      },
    );
    expect(buildWhere([clause({ field: "name", operator: "ends_with", value: needle })])).toEqual({
      sql: "substr(name, -length(?)) = ?",
      bindings: [needle, needle],
    });
  });

  it("insensitive mode lowers both sides of the comparison", () => {
    expect(buildWhere([clause({ field: "email", value: "A@B.com", mode: "insensitive" })])).toEqual(
      {
        sql: "LOWER(email) = ?",
        bindings: ["a@b.com"],
      },
    );
  });

  it("left-folds connectors with parentheses, so AND does not silently outbind a later OR", () => {
    // `a OR b AND c` in raw SQL means `a OR (b AND c)` — different from the
    // left-to-right `(a OR b) AND c` the where-array's connectors specify.
    const where = [
      clause({ field: "a", value: 1, connector: "AND" }),
      clause({ field: "b", value: 2, connector: "OR" }),
      clause({ field: "c", value: 3, connector: "AND" }),
    ];
    expect(buildWhere(where).sql).toBe("((a = ?) OR (b = ?)) AND (c = ?)");
  });

  it("comparison operators bind the raw value, unaffected by mode", () => {
    expect(buildWhere([clause({ field: "n", operator: "gt", value: 5 })])).toEqual({
      sql: "n > ?",
      bindings: [5],
    });
    expect(buildWhere([clause({ field: "n", operator: "lte", value: 5 })])).toEqual({
      sql: "n <= ?",
      bindings: [5],
    });
  });
});
