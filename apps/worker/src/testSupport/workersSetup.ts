import { beforeEach } from "vitest";
import { env } from "cloudflare:workers";
import { reset } from "cloudflare:test";
import { applySchema } from "./applySchema.ts";

/**
 * The workers pool isolates storage per *test file*, not per test (confirmed
 * against a real run: a row a later `it()` in the same file did not insert
 * was still visible from an earlier one) — the official examples rely on
 * exactly this to let tests accumulate state deliberately. Every test file
 * this repository moved here instead expects a fresh, empty, freshly-schema'd
 * database per test, the same guarantee `layerSqlite()` gave by constructing
 * a brand new `:memory:` database per call. `reset()` plus reapplying the
 * schema, run before every test via this global `setupFiles` entry, is what
 * restores that guarantee without editing every moved test's assertions.
 */
beforeEach(async () => {
  await reset();
  await applySchema(env.DB);
});
