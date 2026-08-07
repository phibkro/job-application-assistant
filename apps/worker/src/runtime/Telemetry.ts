import * as Layer from "effect/Layer";
import * as Otlp from "effect/unstable/observability/Otlp";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";

/**
 * Where this service's logs, metrics, and traces go.
 *
 * Effect exports OTLP itself, so nothing here is vendor code: the destination
 * is a URL and a header. Sentry is what we point it at today — it groups
 * errors into issues and tells us when one regresses, which is the single
 * thing Cloudflare's built-in Workers observability does not do — but
 * Honeycomb, Axiom, and Grafana Cloud accept the same payload, so switching is
 * configuration rather than a rewrite. A vendor SDK inside the Worker would
 * have bought the opposite: bundle weight, and a migration to leave.
 *
 * This is deliberately additive. Cloudflare's own logs and invocation traces
 * stay on (see `infra/alchemy.run.ts`) and remain the baseline that works even
 * when the exporter cannot reach its endpoint.
 */
export interface TelemetryConfig {
  /** The collector's base URL. Sentry's is `.../api/{project}/integration/otlp`. */
  readonly endpoint: string;
  /** Sent on every export; Sentry authenticates with `x-sentry-auth`. */
  readonly headers: Record<string, string>;
  readonly environment: string;
}

/**
 * Reads telemetry settings out of the raw Worker environment.
 *
 * Absent settings are not an error. A preview stage with no Sentry project
 * should run, and a deploy that forgot the endpoint should still serve
 * requests — telemetry that takes the service down with it when it is
 * misconfigured is worse than no telemetry. `layer` degrades to nothing;
 * Cloudflare's own observability still records the run.
 */
export const configFrom = (env: unknown): TelemetryConfig | undefined => {
  const bag = (typeof env === "object" && env !== null ? env : {}) as Record<string, unknown>;
  const endpoint = bag.OTLP_ENDPOINT;
  if (typeof endpoint !== "string" || endpoint.trim().length === 0) {
    return undefined;
  }
  const auth = bag.OTLP_AUTH_HEADER;
  const environment = typeof bag.ENVIRONMENT === "string" ? bag.ENVIRONMENT : "unknown";
  return {
    endpoint,
    headers: typeof auth === "string" && auth.length > 0 ? { "x-sentry-auth": auth } : {},
    environment,
  };
};

/**
 * The exporter, or nothing at all.
 *
 * `Layer.empty` when unconfigured rather than a stub exporter that swallows
 * spans: a service reporting to nowhere should be visibly reporting to
 * nowhere, not appear instrumented.
 */
export const layer = (config: TelemetryConfig | undefined): Layer.Layer<never> =>
  config === undefined
    ? Layer.empty
    : // `layerJson`, not `layer`: the latter leaves the serialization format
      // to the caller, and JSON is what an OTLP/HTTP endpoint accepts without
      // a protobuf runtime — which a Worker bundle should not be carrying.
      Otlp.layerJson({
        baseUrl: config.endpoint,
        headers: config.headers,
        resource: {
          serviceName: "job-index",
          attributes: { "deployment.environment": config.environment },
        },
        // A Worker invocation is short and may be frozen between requests, so
        // batches are flushed often rather than accumulated: an export that
        // waits for a full batch is an export that never happens.
        loggerExportInterval: "2 seconds",
        tracerExportInterval: "2 seconds",
        metricsExportInterval: "10 seconds",
      }).pipe(Layer.provide(FetchHttpClient.layer));
