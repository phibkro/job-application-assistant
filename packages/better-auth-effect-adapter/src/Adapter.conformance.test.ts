import { Database as BunSqlite } from "bun:sqlite";
import {
  authFlowTestSuite,
  caseInsensitiveTestSuite,
  normalTestSuite,
  testAdapter,
} from "@better-auth/test-utils/adapter";
import { getAuthTables } from "better-auth/db";
import type { BetterAuthOptions } from "better-auth";
import { effectAdapter } from "./Adapter.ts";
import { renderSchema } from "./Migrate.ts";
import { bunSqliteExecutor } from "./testSupport/BunSqliteExecutor.ts";

/**
 * The official conformance suite (`@better-auth/test-utils`), run against a
 * real `bun:sqlite` engine — see the README for exactly which suites run and
 * why the rest don't.
 *
 * One `testAdapter` call per suite, each over its own database: each
 * `createTestSuite` result tracks "which migration is currently applied" in
 * its own closure, starting from an assumed-empty state. Feeding two suites
 * through one shared database lets the second suite inherit the first's last
 * migration (a plugin's added column, a renamed field) without knowing it
 * has to re-migrate — a cross-suite interaction, not anything the adapter
 * itself does differently. A database per suite removes the shared state
 * that bug needs.
 */
const freshMigrator = () => {
  const db = new BunSqlite(":memory:");
  const runMigrations = async (options: BetterAuthOptions) => {
    const tables = getAuthTables(options);
    for (const definition of Object.values(tables)) {
      db.exec(`DROP TABLE IF EXISTS ${definition.modelName}`);
    }
    db.exec(renderSchema(tables));
  };
  return { adapter: () => effectAdapter(bunSqliteExecutor(db)), runMigrations };
};

/**
 * Four `normalTestSuite` tests are disabled, not silently skipped: they fail
 * for a reason that is a real property of SQL, not a bug in the where-clause
 * or column-mapping work above.
 *
 * Each fetches an `account` row through a join and compares it to the exact
 * object `create` returned. The suite's own fixture generator
 * (`generateModel("account")` in `create-test-suite.mjs`) never sets
 * `password` — every other account field, it does — so `create`'s echoed
 * object simply has no `password` key. A real table has no such thing as "no
 * key": the column exists from `CREATE TABLE` on, and a value never written
 * to it reads back as SQL `NULL`, not as "absent". `toEqual` tells `{
 * password: undefined }` (the key never existed) apart from `{ password: null
 * }` (the key holds SQL's null), so the join's `account` sub-object — read
 * back through a real column — never matches the creation echo on this one
 * field. An in-memory reference adapter has no such gap: a JS object that
 * never had the key stays that way. A relational one cannot fake it without
 * inventing a second "no value" outside NULL, which is a bigger change than
 * this one field justifies.
 */
const normal = normalTestSuite({
  disableTests: {
    "findOne - should find a model with join": true,
    "findOne - should select fields with multiple joins": true,
    "findMany - should find many models with join": true,
    "findMany - should select fields with multiple joins": true,
  },
});

const suites = [normal, caseInsensitiveTestSuite(), authFlowTestSuite()];

for (const tests of suites) {
  // Sequential by necessity: `execute()` registers this suite's vitest tests
  // synchronously against the suite's own fresh database, and the next
  // suite's `testAdapter()` must not start building its own state — or
  // registering tests — until that has happened.
  // eslint-disable-next-line no-await-in-loop
  const { execute } = await testAdapter({ ...freshMigrator(), tests: [tests] });
  execute();
}
