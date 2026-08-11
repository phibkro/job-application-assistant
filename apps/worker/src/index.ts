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
import { scheduledIngestion } from "./ingestion/scheduled.ts";
import { SourceLeaseObject } from "./ingestion/SourceLeaseObject.ts";

/**
 * Cloudflare finds a Durable Object class by name against a top-level export
 * of the Worker's *main* module — `infra/alchemy.run.ts` and
 * `dev/preview.wrangler.jsonc` both bind `SOURCE_LEASE` to `className:
 * "SourceLeaseObject"`, and this is the export that name has to resolve
 * against. It is otherwise unused here: nothing in this file calls it
 * directly, `env.SOURCE_LEASE` is how a request reaches it.
 */
export { SourceLeaseObject };

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
 * ## Deployment boundary
 *
 * `infra/alchemy.run.ts` declares this Worker for every stage, but a source
 * declaration is not deployment evidence. The scheduled program lives in
 * `ingestion/scheduled.ts`; this composition root only supplies live services
 * and hands its promise to Cloudflare's execution context.
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
    ctx.waitUntil(
      Effect.runPromise(
        scheduledIngestion.pipe(Effect.provide(services(decodeEnv(env))), Effect.provide(platform)),
      ),
    );
  },
};
