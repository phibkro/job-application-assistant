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
 * Every stage runs the TypeScript worker. `main` is the bundled service and
 * the schema is `db/schema.sql`, applied by the deploy script rather than by
 * Alchemy — see `scripts/deploy.sh`.
 *
 * Stages map to the service's environments:
 *
 *   bun alchemy deploy --stage staging
 *   bun alchemy deploy --stage production
 */

const STAGE = process.env.ALCHEMY_STAGE ?? "staging";
const PRODUCTION = STAGE === "production";

/**
 * Every stage runs the TypeScript service. The Rust worker it replaced is
 * deleted, so there is no longer a second thing to point at.
 *
 * The conditional that used to live here — `preview` on TypeScript, everything
 * else on Rust — was the strangler migration in an infrastructure file. It has
 * served its purpose: the replacement was deployed beside the original,
 * exercised against real Cloudflare, and only then given the other stages.
 *
 * What remains stage-dependent is real: the custom domain belongs to preview,
 * and ingestion's schedule belongs to stages that should actually collect.
 */

/**
 * Where the TypeScript service answers, beside its workers.dev URL.
 *
 * A name, not an identity: the operator has said this one is temporary. It is
 * one string here rather than scattered through docs and smoke scripts so that
 * changing it later is one edit, and it is stage-scoped so the Rust
 * deployments keep their own hostnames.
 */
const PREVIEW_DOMAINS = ["job-index.phibkro.org"];

/**
 * Where verification and sign-in mail comes from, and — for now — the only
 * place it may go.
 *
 * Sending to arbitrary recipients requires the Workers Paid plan; sending to a
 * verified destination is free on every plan. Naming the destination here is
 * what makes that limit visible in the infrastructure rather than discovered
 * by a stranger whose sign-up silently failed. Proven by sending through the
 * binding on the edge before it was declared: Cloudflare accepted a message
 * from this sender to this destination on the current plan.
 *
 * Remove `destinationAddress` when the plan allows strangers. Nothing else
 * changes — `apps/worker/src/email/` already speaks to the binding.
 */
const MAIL_FROM = "noreply@phibkro.org";
const MAIL_VERIFIED_DESTINATION = "philib.krogh@gmail.com";

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
/**
 * `BROWSER_RENDERING_TOKEN` is deliberately absent.
 *
 * The Rust worker reached Browser Run over its REST API, which needs an
 * account id and a token. A Worker does not: the runtime binding requires no
 * credential at all ("No API token is needed when using the Workers binding",
 * Cloudflare's own docs), and the TypeScript service will take that path. The
 * Rust code degrades to a plain fetch when the secret is missing, so removing
 * it costs that deployment a capability it was never configured for rather
 * than breaking it.
 */
const secretBindings = () => {
  const bindings: Record<string, Redacted.Redacted<string>> = {};
  for (const name of [
    "NAV_API_TOKEN",
    "ADMIN_SYNC_TOKEN",
    "LINKEDIN_CLIENT_ID",
    "LINKEDIN_CLIENT_SECRET",
    "CLOUDFLARE_ACCOUNT_ID",
    // Telemetry goes out over OTLP, so the vendor is a URL and a header
    // rather than an SDK — see apps/worker/src/runtime/Telemetry.ts. Absent
    // values leave the exporter off; the service runs either way.
    "OTLP_ENDPOINT",
    "OTLP_AUTH_HEADER",
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
  // How long a crashed run blocks NAV before its `SourceLease` Durable
  // Object's recovery alarm reclaims it — not a value anything compares
  // against a clock, unlike its D1-lease-era predecessor `NAV_LEASE_TTL_MS`.
  NAV_LEASE_RECOVERY_MS: "90000",
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
      // The Rust service's ten ordered migrations, and only for the stages
      // that run it. The TypeScript service starts on a new database from the
      // generated snapshot (`db/schema.sql`, applied by
      // `scripts/deploy-preview.sh`): nothing is back-filled, so there is no
      // earlier shape to migrate from, and applying both leaves a database
      // that matches neither — a `CREATE TABLE IF NOT EXISTS` quietly keeps
      // the legacy shape and the next index fails against it. Found by
      // deploying: "no such column: profileId".
      // No migrationsDir: the schema is one generated snapshot
      // (`db/schema.sql`), applied by the deploy script. Incremental
      // migrations resume when a deployment exists whose shape must be
      // preserved.
    });

    const email = yield* Cloudflare.SendEmail("Mail", {
      destinationAddress: MAIL_VERIFIED_DESTINATION,
      allowedSenderAddresses: [MAIL_FROM],
    });

    // One Durable Object per source, admitting one `Ingestion.collect` run
    // at a time for it — see `apps/worker/src/ingestion/SourceLeaseObject.ts`.
    // `className`
    // names the class `apps/worker/src/index.ts` exports, which is not the
    // same string as the binding key below (`SOURCE_LEASE`, what
    // `apps/worker/src/runtime/Env.ts` reads) — Alchemy diffs this against
    // its own state to compute the Cloudflare migration a first-time DO
    // class requires (`new_sqlite_classes`); there is nothing to hand-write
    // here.
    const sourceLease = Cloudflare.DurableObjectNamespace("SourceLease", {
      className: "SourceLeaseObject",
    });

    const api = yield* Cloudflare.Worker("Api", {
      name: `job-index-${STAGE}`,
      // A pre-built artifact, not a source: the deploy script bundles it with
      // the same command the local preview uses, so what deploys is what was
      // run locally.
      main: "../.preview/worker.js",
      // The interface ships beside the API on one origin. Unmatched paths
      // fall back to the app shell because the interface routes client-side;
      // `/api/*` runs the Worker first so the asset router cannot shadow an
      // endpoint with the shell.
      assets: {
        directory: "../apps/web/dist",
        config: {
          notFoundHandling: "single-page-application",
          runWorkerFirst: ["/api/*"],
        },
      },
      compatibility: { date: "2026-05-25" },
      // The workers.dev URL stays on alongside the custom domain: it is what
      // the smoke checks hit, and it keeps working if DNS is mid-change.
      url: true,
      domain: STAGE === "preview" ? PREVIEW_DOMAINS : undefined,
      env: {
        DB: database,
        EMAIL: email,
        SOURCE_LEASE: sourceLease,
        ...environmentVars,
        // The sender is configuration, not a secret: it appears in the
        // From header of every message this service sends.
        MAIL_FROM,
        ...secretBindings(),
      },
      // Preview collects nothing on a schedule: it exists to be poked at, and
      // a cron writing into it while someone reads it makes both confusing.
      crons: STAGE === "preview" ? [] : CRONS,
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
