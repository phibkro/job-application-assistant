import type { Where } from "better-auth/adapters";

/** A `CleanedWhere` from `better-auth/adapters`: every optional field filled in before it reaches an adapter. */
export type CleanedWhere = Required<Where>;

/** A SQL fragment and the values it binds, kept together so one can never drift from the other. */
export interface Clause {
  readonly sql: string;
  readonly bindings: ReadonlyArray<unknown>;
}

const isInsensitive = (clause: CleanedWhere): boolean =>
  clause.mode === "insensitive" &&
  (typeof clause.value === "string" ||
    (Array.isArray(clause.value) && clause.value.every((v) => typeof v === "string")));

const lower = (insensitive: boolean, value: unknown): unknown =>
  insensitive && typeof value === "string" ? value.toLowerCase() : value;

/**
 * `contains`/`starts_with`/`ends_with` as literal substring tests, not
 * pattern matches.
 *
 * `LIKE` needs its own value escaped before use — `%` and `_` inside the
 * *data* would otherwise be read back as wildcards, which is exactly the
 * "should not interpret regex/wildcard patterns" failure the conformance
 * suite checks for. `instr()`/`substr()` sidestep that class of bug rather
 * than defend against it: they compare bytes, so there is no escaping to
 * forget.
 */
const substringClause = (
  column: string,
  operator: "contains" | "starts_with" | "ends_with",
  value: unknown,
): Clause => {
  switch (operator) {
    case "contains":
      return { sql: `instr(${column}, ?) > 0`, bindings: [value] };
    case "starts_with":
      return { sql: `instr(${column}, ?) = 1`, bindings: [value] };
    case "ends_with":
      // `substr(x, -N)` reads the last N characters of x; comparing that to
      // the needle is "ends with" without ever building a wildcard pattern.
      return { sql: `substr(${column}, -length(?)) = ?`, bindings: [value, value] };
  }
};

const clauseFor = (where: CleanedWhere): Clause => {
  const insensitive = isInsensitive(where);
  const field = where.field;
  const column = insensitive ? `LOWER(${field})` : field;
  const value = lower(insensitive, where.value);

  switch (where.operator) {
    case "in": {
      const values = where.value as ReadonlyArray<unknown>;
      // An empty IN list is not a SQL error but it must match nothing; SQLite
      // rejects `IN ()`, so this is spelled out rather than emitted literally.
      if (values.length === 0) return { sql: "0 = 1", bindings: [] };
      return {
        sql: `${column} IN (${values.map(() => "?").join(", ")})`,
        bindings: values.map((v) => lower(insensitive, v)),
      };
    }
    case "not_in": {
      const values = where.value as ReadonlyArray<unknown>;
      if (values.length === 0) return { sql: "1 = 1", bindings: [] };
      return {
        sql: `${column} NOT IN (${values.map(() => "?").join(", ")})`,
        bindings: values.map((v) => lower(insensitive, v)),
      };
    }
    case "contains":
    case "starts_with":
    case "ends_with":
      return substringClause(column, where.operator, value);
    case "ne":
      // `!= NULL` is never true in SQL; "not this value" for a null value
      // means "not absent", which is `IS NOT NULL`.
      return where.value === null
        ? { sql: `${field} IS NOT NULL`, bindings: [] }
        : { sql: `${column} <> ?`, bindings: [value] };
    case "gt":
      return { sql: `${field} > ?`, bindings: [where.value] };
    case "gte":
      return { sql: `${field} >= ?`, bindings: [where.value] };
    case "lt":
      return { sql: `${field} < ?`, bindings: [where.value] };
    case "lte":
      return { sql: `${field} <= ?`, bindings: [where.value] };
    case "eq":
    default:
      return where.value === null
        ? { sql: `${field} IS NULL`, bindings: [] }
        : { sql: `${column} = ?`, bindings: [value] };
  }
};

/**
 * A `Where[]` folds left to right, each clause joined to the running result
 * by its own `connector` — not grouped into an AND-block and an OR-block the
 * way a hand-written SQL `WHERE` usually is. That is the behaviour the
 * conformance suite's connector tests are written against (mirroring the
 * in-memory reference adapter's own left-to-right `reduce`), and it is
 * observably different from what bare `... AND ... OR ...` text would mean:
 * SQL binds `AND` tighter than `OR`, so `a OR b AND c` reads as `a OR (b AND
 * c)`, not `(a OR b) AND c`. Parenthesising every fold step is what makes the
 * emitted SQL evaluate in the same left-to-right order regardless of which
 * connector comes next.
 */
export const buildWhere = (clauses: ReadonlyArray<CleanedWhere>): Clause => {
  if (clauses.length === 0) return { sql: "1 = 1", bindings: [] };
  const [first, ...rest] = clauses.map(clauseFor);
  return rest.reduce<Clause>(
    (acc, next, index) => ({
      sql: `(${acc.sql}) ${clauses[index + 1].connector} (${next.sql})`,
      bindings: [...acc.bindings, ...next.bindings],
    }),
    first,
  );
};
