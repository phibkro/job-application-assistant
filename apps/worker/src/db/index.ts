/**
 * The persistence slot's public surface: the `Database` layer, and the
 * repositories built on it.
 *
 * `layer` is the one export the frozen migration contract names explicitly —
 * the production, D1-backed realization of `services/Database.ts`. It is a
 * factory, not a bare `Layer` value: `env.DB` only exists inside a Worker's
 * fetch handler, so there is no module-scope binding to close over. Whatever
 * wires the Worker's entrypoint calls `layer(env.DB)` once per request (or
 * shares one across requests, `env.DB` being stable per Worker instance) and
 * provides the result to anything that needs `Database`.
 *
 * `layerSqlite` is exported alongside it for the same reason the repository
 * tests use it: a real SQL engine, running the real generated schema, is
 * available to any other slot that wants to test against persistence without
 * a live D1 binding.
 */
export { layer } from "./Live.ts";
export { layerSqlite } from "./Sqlite.ts";
export { eraseProfile } from "./Erase.ts";

export * as Answers from "./repositories/Answers.ts";
export * as DeliveryPlatforms from "./repositories/DeliveryPlatforms.ts";
export * as Submissions from "./repositories/Submissions.ts";
export * as Freshness from "./repositories/Freshness.ts";
export * as Judgements from "./repositories/Judgements.ts";
export * as Sessions from "./repositories/Sessions.ts";
export * as Subscriptions from "./repositories/Subscriptions.ts";
