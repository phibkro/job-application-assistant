import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as State from "alchemy/State";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";

/**
 * Cloudflare infrastructure for job-index (Alchemy v2 IaC).
 *
 * Declares what the service runs on: the D1 database that is its system of
 * record, its schema, and the Worker with its bindings and cron triggers.
 *
 * This replaces the `wrangler d1 create` / `wrangler deploy` steps that
 * scripts/deploy.sh used to perform. The release *gates* stay in that script,
 * because they are process rather than infrastructure: production credential
 * preflight, migration checks, the destructive/non-destructive smoke split,
 * and the evidence record. Alchemy answers "what exists"; deploy.sh answers
 * "may this ship".
 *
 * The Worker is Rust compiled to WebAssembly. `main` points at the
 * worker-build output, whose entry imports the `.wasm` alongside it, so
 * `just build` (or `worker-build --release`) must run before a deploy.
 *
 * This file still describes the Rust service, deliberately: the TypeScript
 * replacement is being built beside it and has no entry point yet, and RFC
 * 0015's migration keeps the Rust worker serving until each route group is
 * cut over. Two things change at that point, together and not before —
 * `main` points at the bundled TypeScript worker, and `migrationsDir` gives
 * way to the generated `db/schema.sql`, applied to a new database. The corpus
 * is a cache, so nothing is back-filled and the ten ordered migrations below
 * collapse into that one snapshot. Repointing either half early would deploy
 * a Worker against a schema it does not expect.
 *
 * Stages map to the service's environments:
 *
 *   bun alchemy deploy --stage staging
 *   bun alchemy deploy --stage production
 */

const STAGE = process.env.ALCHEMY_STAGE ?? "staging";
const PRODUCTION = STAGE === "production";

/**
 * Production is published in two phases so a cron-enabled version can never
 * run before its credentials exist: the first deploy omits triggers and
 * disables synchronization, the second activates them. scripts/deploy.sh sets
 * this on the second pass only.
 */
const ACTIVATE_SCHEDULES = process.env.JOB_INDEX_ACTIVATE_SCHEDULES === "1";

/**
 * Secrets are declared here rather than uploaded separately, because this
 * Worker's binding set is declared in full on every deploy — a secret set
 * out-of-band by `wrangler secret put` would be dropped by the next one.
 *
 * A secret absent from the environment is omitted rather than blanked, so a
 * deploy that does not carry credentials leaves the existing ones alone. The
 * production preflight in scripts/deploy.sh is what refuses to ship without
 * them; this file does not second-guess that gate.
 */
const secretBindings = () => {
  const bindings: Record<string, Redacted.Redacted<string>> = {};
  for (const name of [
    "NAV_API_TOKEN",
    "ADMIN_SYNC_TOKEN",
    "LINKEDIN_CLIENT_ID",
    "LINKEDIN_CLIENT_SECRET",
    "CLOUDFLARE_ACCOUNT_ID",
    "BROWSER_RENDERING_TOKEN",
  ]) {
    const value = process.env[name];
    if (value && value.trim().length > 0) {
      bindings[name] = Redacted.make(value);
    }
  }
  return bindings;
};

/**
 * Environment variables the Worker reads. These previously lived in
 * wrangler.{staging,production}.jsonc; keeping them here means one file
 * decides what each environment permits.
 *
 * The production values are the restrictive ones on purpose: demo mutations
 * and unauthenticated NAV sync are development conveniences that would be
 * destructive endpoints on a live corpus.
 */
const environmentVars = {
  ENVIRONMENT: STAGE,
  ALLOW_DEMO_MUTATIONS: PRODUCTION ? "false" : "true",
  ALLOW_NAV_SYNC_WITHOUT_TOKEN: PRODUCTION ? "false" : "true",
  NAV_USE_PUBLIC_TOKEN: PRODUCTION ? "false" : "true",
  // Ingestion only runs once the schedules are activated, which is the second
  // phase of a production deploy.
  NAV_SYNC_ENABLED: PRODUCTION && ACTIVATE_SCHEDULES ? "true" : "false",
  NAV_DETAIL_FETCH_LIMIT: "40",
  NAV_MAX_PAGES_PER_RUN: "4",
  NAV_MAX_OBSERVATIONS_PER_RUN: "600",
  NAV_MAX_DURATION_MS: "20000",
  NAV_LEASE_TTL_MS: "90000",
} as const;

/**
 * Staggered so the three background jobs never contend for the same minute:
 * NAV ingestion, saved-search evaluation (which also runs due application
 * schedules), and webhook delivery each get their own budget.
 *
 * Only production runs them. A staging deploy that also ingested would race
 * the production connector for the same NAV cursor.
 */
const CRONS =
  PRODUCTION && ACTIVATE_SCHEDULES
    ? [
        "0,15,30,45 * * * *",
        "2,7,12,17,22,27,32,37,42,47,52,57 * * * *",
        "4,9,14,19,24,29,34,39,44,49,54,59 * * * *",
      ]
    : [];

export default Alchemy.Stack(
  "JobIndex",
  { providers: Cloudflare.providers(), state: State.localState() },
  Effect.gen(function* () {
    // The system of record. Alchemy applies migrations/ itself, so schema and
    // database are created by the same step that declares them — there is no
    // window where the Worker is live against an unmigrated database.
    const database = yield* Cloudflare.D1Database("Db", {
      name: `job-index-${STAGE}-db`,
      // Norwegian vacancies read from Norway.
      primaryLocationHint: "weur",
      migrationsDir: "../migrations",
    });

    const api = yield* Cloudflare.Worker("Api", {
      name: `job-index-${STAGE}`,
      main: "../crates/job-index-worker/build/index.js",
      compatibility: { date: "2026-05-25" },
      url: true,
      env: {
        DB: database,
        ...environmentVars,
        ...secretBindings(),
      },
      crons: CRONS,
      observability: {
        enabled: true,
        logs: { enabled: true, invocationLogs: true },
      },
    });

    // Consumed by scripts/deploy.sh, which smokes the URL and records the
    // deployment evidence.
    return {
      url: api.url,
      worker: api.workerName,
      database: database.databaseName,
      databaseId: database.databaseId,
      stage: STAGE,
    };
  }),
);
