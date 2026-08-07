import * as Effect from "effect/Effect";
import type { Database } from "../services/Database.ts";
import { layerSqlite } from "./Sqlite.ts";

/**
 * Runs an effect against a fresh, isolated in-memory `layerSqlite()` — one
 * database per call, so repository tests never share state through a
 * process-wide singleton. Shared by every repository's test file rather than
 * re-implemented per file, so "how a repository test is run" has one home.
 */
export const runTest = <A>(effect: Effect.Effect<A, never, Database>): Promise<A> =>
  Effect.runPromise(Effect.provide(effect, layerSqlite()));
