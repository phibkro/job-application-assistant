import type { D1Database } from "../db/D1.ts";
// Raw text, not a runtime file read — see `workerdEnv.d.ts` for why a
// workers-pool test cannot use `node:fs` the way `Sqlite.ts` does.
// @ts-expect-error typed ambiently in workerdEnv.d.ts, but Vite's own
// import-analysis plugin still flags the `?raw` specifier itself
import schemaSql from "../../../../db/schema.sql?raw";

/**
 * `D1Database.exec()` cannot run this file directly: it treats every
 * newline as a statement boundary (documented Cloudflare behaviour, verified
 * against a real local D1 binding — a comment line or a `CREATE TABLE`'s
 * second line each error as "SQL code did not contain a statement"). So this
 * splits on `;` after stripping `--` comment lines and sends each statement
 * through `prepare().run()` instead, sequentially: `CREATE TABLE`/`CREATE
 * INDEX` are schema DDL, not writes a batch's atomicity is needed for.
 */
export const applySchema = async (db: D1Database): Promise<void> => {
  const statements = schemaSql
    .split("\n")
    .filter((line: string) => !line.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((statement: string) => statement.trim())
    .filter((statement: string) => statement.length > 0);
  for (const statement of statements) {
    // Sequential, deliberately: later `CREATE INDEX` statements reference
    // tables the earlier `CREATE TABLE` statements just created.
    // eslint-disable-next-line no-await-in-loop
    await db.prepare(statement).run();
  }
};
