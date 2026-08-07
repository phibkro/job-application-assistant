import * as Layer from "effect/Layer";
import * as HttpRouter from "effect/unstable/http/HttpRouter";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";
import { decodeEnv, type Env } from "./runtime/Env.ts";
import { services } from "./runtime/Layers.ts";

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
 * The API's route groups. `HttpApiBuilder.layer(api)` needs a handler layer
 * per group; those are being written now. When they land, that layer merges
 * into `appLayer` beside the operational routes below and this file gains one
 * import — the shape does not otherwise change. Until then this worker is not
 * deployed: the Rust service still serves every route, per RFC 0015's
 * strangler migration, and `infra/alchemy.run.ts` still points at it.
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
  operationalRoutes(env).pipe(Layer.provide(services(env)), Layer.provide(HttpRouter.layer));

let handler: ((request: Request) => Promise<Response>) | undefined;

export default {
  fetch(request: Request, env: unknown): Promise<Response> {
    if (handler === undefined) {
      handler = HttpRouter.toWebHandler(appLayer(decodeEnv(env))).handler;
    }
    return handler(request);
  },
};
