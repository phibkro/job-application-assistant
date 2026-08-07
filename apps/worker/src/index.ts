import * as Layer from "effect/Layer";
import * as HttpApiBuilder from "effect/unstable/httpapi/HttpApiBuilder";
import * as HttpRouter from "effect/unstable/http/HttpRouter";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";
import { api } from "./Api.ts";
import * as Handlers from "./handlers/index.ts";
import { decodeEnv, type Env } from "./runtime/Env.ts";
import { services } from "./runtime/Layers.ts";
import { platform } from "./runtime/Platform.ts";

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
 * still points at it. `main` and `migrationsDir` move together at cutover.
 *
 * Also absent by choice: `scheduled`. Ingestion has no implementation yet, and
 * an empty cron handler that silently does nothing is worse than none at all —
 * the Rust worker still owns the schedules.
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
        license: "AGPL-3.0-or-later",
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
export const appLayer = (env: Env): Layer.Layer<never, never, never> =>
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
  );

let handler: ((request: Request) => Promise<Response>) | undefined;

export default {
  fetch(request: Request, env: unknown): Promise<Response> {
    if (handler === undefined) {
      handler = HttpRouter.toWebHandler(appLayer(decodeEnv(env))).handler;
    }
    return handler(request);
  },
};
