import * as Effect from "effect/Effect";
import { env } from "cloudflare:workers";
import type { Database } from "../services/Database.ts";
import { layer } from "./Live.ts";

/**
 * Runs an effect against the real D1 binding this test file's Worker was
 * given (`dev/test.wrangler.jsonc`, wired by `@cloudflare/vitest-pool-workers`
 * from `vitest.workers.config.ts`) — real SQL, the real generated schema,
 * D1's real constraint and batching behaviour, not `bun:sqlite` standing in
 * for it. Isolation between tests is not this function's job: every test in
 * this file's suite gets a reset, re-schema'd database before it runs, via
 * the global `beforeEach` in `testSupport/workersSetup.ts` — see that file
 * for why (storage here isolates per test *file*, not per test, so a
 * `layerSqlite()`-style "fresh database per call" had to move to a hook that
 * runs once per test instead of once per `runTest` call).
 *
 * Shared by every repository's test file rather than re-implemented per
 * file, so "how a repository test is run" has one home — unchanged from
 * before this moved off `bun:sqlite`; only what is inside changed.
 */
export const runTest = <A>(effect: Effect.Effect<A, never, Database>): Promise<A> =>
  Effect.runPromise(Effect.provide(effect, layer(env.DB)));
