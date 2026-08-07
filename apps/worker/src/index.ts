import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as HttpApiBuilder from "effect/unstable/httpapi/HttpApiBuilder";
import * as HttpRouter from "effect/unstable/http/HttpRouter";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";
import { api } from "./Api.ts";
import * as Handlers from "./handlers/index.ts";
import { decodeEnv, type Env } from "./runtime/Env.ts";
import { services } from "./runtime/Layers.ts";
import { platform } from "./runtime/Platform.ts";
import { configFrom, layer as telemetry } from "./runtime/Telemetry.ts";
import type { TelemetryConfig } from "./runtime/Telemetry.ts";
import { Ingestion } from "./services/Ingestion.ts";
import type { RunBudget } from "./services/Ingestion.ts";
import { SourceCatalog } from "./services/SourceCatalog.ts";

/**
 * The Worker entry point.
 *
 * Two things happen here and nowhere else: the platform's untyped `env` is
 * checked into an `Env`, and the service graph is built on top of it. Below
 * this line the program is ordinary Effect code that knows nothing about
 * Cloudflare.
 *
 * ## Why the handler is cached
 *
 * `env.DB` exists only inside a request — there is no module-scope binding to
 * close over — but it is the same binding for the life of the isolate. So the
 * handler is built on the first request and reused, which is what the
 * persistence slot's `layer(d1)` factory was shaped for. Rebuilding it per
 * request would reconstruct every layer on every call.
 *
 * ## What is not here yet
 *
 * Nothing of the API. Every route group is served below. What is still
 * missing is the deploy: the Rust service continues to answer production
 * traffic, per RFC 0015's strangler migration, and `infra/alchemy.run.ts`
 * still points at it. `main` and `migrationsDir` move together at cutover —
 * `scheduled` below is wired and tested, but the cron trigger that would
 * actually invoke it on a schedule is declared in `infra/`, which moves at
 * the same cutover, not before.
 */

/** Liveness, and what this deployment believes it is. Mirrors the Rust
 *  service's `/api/health` and `/api/about` exactly: the smoke suites assert
 *  these bodies, and a cutover that changed them would look like an outage. */
const operationalRoutes = (env: Env): Layer.Layer<never, never, HttpRouter.HttpRouter> =>
  Layer.mergeAll(
    HttpRouter.add(
      "GET",
      "/api/health",
      HttpServerResponse.jsonUnsafe({
        status: "ok",
        service: "job-index",
        environment: env.ENVIRONMENT,
      }),
    ),
    HttpRouter.add(
      "GET",
      "/api/about",
      HttpServerResponse.jsonUnsafe({
        service: "job-index",
        license: "proprietary",
        environment: env.ENVIRONMENT,
      }),
    ),
  );

/**
 * Everything the worker serves, over everything it runs on.
 *
 * Exported so a test can drive the whole application through
 * `HttpRouter.toWebHandler` against a substituted service layer, rather than
 * asserting on the parts and hoping the wiring agrees.
 */
export const appLayer = (
  env: Env,
  telemetryConfig?: TelemetryConfig,
): Layer.Layer<never, never, never> =>
  Layer.mergeAll(
    operationalRoutes(env),
    // Every group's handlers, then the api itself: `HttpApiBuilder.layer`
    // registers the declaration's routes and requires one handler layer per
    // group, so a group nobody implemented is a type error here rather than a
    // 404 someone finds in production.
    HttpApiBuilder.layer(api).pipe(
      Layer.provide(
        Layer.mergeAll(Handlers.corpus, Handlers.feed, Handlers.profile, Handlers.applications),
      ),
      Layer.provide(Handlers.auth),
    ),
  ).pipe(
    // `provideRequest`, not `provide`: a handler's dependencies are
    // request-scoped in this router (`Request<"Requires", Corpus>`), and only
    // this discharges that wrapper. The services themselves are built once —
    // the graph is constructed at layer time and shared across requests.
    HttpRouter.provideRequest(services(env)),
    // Again at layer level, not only per request: the authentication
    // middleware resolves `Accounts` when the layer is built, not when a
    // request arrives.
    Layer.provide(services(env)),
    Layer.provide(platform),
    Layer.provide(HttpRouter.layer),
    // Outermost, so spans and logs from every layer beneath it are exported —
    // including the ones emitted while the graph is still being built. Absent
    // configuration makes this `Layer.empty`; see `runtime/Telemetry.ts`.
    Layer.provide(telemetry(telemetryConfig)),
  );

let handler: ((request: Request) => Promise<Response>) | undefined;

/**
 * Default bounds for a scheduled run. Generous relative to a single
 * scheduled-event invocation's CPU/wall-clock allowance, but still bounded —
 * `Ingestion.ts`'s own doc comment states why every one of these exists.
 * `leaseTtlMs` is well past `maxDurationMs`: a run's lease must outlive its
 * own walk, plus slack for retries and for the gap between "the lease is
 * acquired" and "the first page fetch actually starts", or a run could have
 * its own lease expire and get stolen out from under it before it finishes.
 */
const DEFAULT_RUN_BUDGET: RunBudget = {
  maxPages: 50,
  maxObservations: 2000,
  maxDurationMs: 25_000,
  leaseTtlMs: 5 * 60 * 1000,
};

/**
 * Runs `Ingestion.collect` once for every catalogued platform.
 *
 * `LeaseHeld` is swallowed, not reported: it means another trigger is
 * already collecting that platform, which is the routine outcome for a
 * schedule that fires more often than one platform's sweep completes — not
 * a failure. `collect`'s contract promises no other typed failure, so
 * anything else that escapes here is a defect, and is deliberately left to
 * propagate: that is what should surface as a Cloudflare-visible error,
 * rather than being caught and hidden by this loop.
 */
const runIngestion = (env: Env): Effect.Effect<void> =>
  Effect.gen(function* () {
    const catalog = yield* SourceCatalog;
    const ingestion = yield* Ingestion;
    const entries = yield* catalog.list();
    yield* Effect.forEach(
      entries,
      (entry) =>
        ingestion
          .collect(entry.id, DEFAULT_RUN_BUDGET)
          .pipe(Effect.catchTag("LeaseHeld", () => Effect.void)),
      { discard: true },
    );
  }).pipe(Effect.provide(services(env)), Effect.provide(platform));

/**
 * Cloudflare's `ExecutionContext`, typed structurally rather than imported
 * from `@cloudflare/workers-types` — see `db/D1.ts` for why: that package is
 * not installed anywhere in this workspace, and a real `ExecutionContext`
 * satisfies this shape structurally, so nothing is lost at the call site.
 */
interface ScheduledContext {
  readonly waitUntil: (promise: Promise<unknown>) => void;
}

export default {
  fetch(request: Request, env: unknown): Promise<Response> {
    if (handler === undefined) {
      handler = HttpRouter.toWebHandler(appLayer(decodeEnv(env), configFrom(env))).handler;
    }
    return handler(request);
  },
  /**
   * `waitUntil`, not a returned/awaited promise: a scheduled handler that
   * returns before its async work finishes risks the isolate being torn
   * down mid-run, which is the one thing the lease TTL exists to make
   * survivable, not the thing this handler should invite in the first place.
   */
  scheduled(_event: unknown, env: unknown, ctx: ScheduledContext): void {
    ctx.waitUntil(Effect.runPromise(runIngestion(decodeEnv(env))));
  },
};
