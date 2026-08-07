import type { BetterAuthDBSchema, DBFieldAttribute } from "better-auth/db";

const AFFINITY: Record<string, string> = {
  string: "TEXT",
  number: "INTEGER",
  boolean: "INTEGER",
  date: "TEXT",
  json: "TEXT",
  "string[]": "TEXT",
  "number[]": "TEXT",
};

/**
 * A field's SQLite column type.
 *
 * This adapter is configured with `supportsJSON`, `supportsDates`,
 * `supportsBooleans`, and `supportsArrays` all `false` (see `Adapter.ts`), so
 * Better Auth itself converts dates/booleans/arrays/objects to strings and
 * `0`/`1` before a value ever reaches this package's SQL. Every non-`string`
 * `DBFieldType` above is a fallback for a type Better Auth's own conversion
 * already normalised to text or an integer — not a second conversion layer.
 */
const columnType = (field: DBFieldAttribute): string => AFFINITY[String(field.type)] ?? "TEXT";

/**
 * Turns Better Auth's resolved schema — the four base tables plus whatever a
 * plugin adds — into `CREATE TABLE` statements.
 *
 * Deliberately no `FOREIGN KEY` or `CHECK` constraints: `field.references`
 * describes a relationship for Better Auth's own query planning, not a
 * constraint this package enforces, and plugin schemas are supplied at
 * runtime with no guaranteed table ordering — a foreign key to a
 * not-yet-created table would fail before the schema settles. `id` is always
 * the primary key: every Better Auth model carries one, by the framework's
 * own convention (see `@better-auth/core/db/type`'s `BetterAuthDBSchema`).
 */
export const renderSchema = (tables: BetterAuthDBSchema): string =>
  Object.values(tables)
    .map((definition) => {
      // `field.fieldName`, not the schema key: Better Auth remaps a field's
      // key to `fieldName` in every `data`/`where` it hands the adapter (a
      // `user.email` schema field can be aliased to an `email_address`
      // column), so the column this creates must already be the name every
      // other method will address it by. Only the four base models carry an
      // explicit `fieldName` from `getAuthTables` — a plugin-declared field
      // leaves it `undefined`, meaning "use the schema key as-is".
      const columns = Object.entries(definition.fields).map(([key, field]) => {
        const notNull = field.required === false ? "" : " NOT NULL";
        const unique = field.unique === true ? " UNIQUE" : "";
        return `  ${field.fieldName ?? key} ${columnType(field)}${notNull}${unique}`;
      });
      return [
        `CREATE TABLE IF NOT EXISTS ${definition.modelName} (`,
        ["  id TEXT PRIMARY KEY", ...columns].join(",\n"),
        ");",
      ].join("\n");
    })
    .join("\n\n");
