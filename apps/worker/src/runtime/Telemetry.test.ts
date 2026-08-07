import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { configFrom, layer } from "./Telemetry.ts";

/**
 * The property that matters here is what happens when telemetry is NOT
 * configured. An exporter that takes the service down when its endpoint is
 * missing has traded a working deployment for a monitored one.
 */
describe("telemetry configuration", () => {
  it("is absent when no endpoint is set, rather than half-configured", () => {
    expect(configFrom({ ENVIRONMENT: "preview" })).toBeUndefined();
    expect(configFrom({ OTLP_ENDPOINT: "   ", ENVIRONMENT: "preview" })).toBeUndefined();
    expect(configFrom(undefined)).toBeUndefined();
  });

  it("carries the auth header only when there is one to carry", () => {
    const anonymous = configFrom({ OTLP_ENDPOINT: "https://collector.example", ENVIRONMENT: "x" });
    expect(anonymous?.headers).toEqual({});

    const authenticated = configFrom({
      OTLP_ENDPOINT: "https://collector.example",
      OTLP_AUTH_HEADER: "sentry_key=abc",
      ENVIRONMENT: "x",
    });
    expect(authenticated?.headers).toEqual({ "x-sentry-auth": "sentry_key=abc" });
  });

  it("records which deployment the telemetry came from", () => {
    expect(
      configFrom({ OTLP_ENDPOINT: "https://collector.example", ENVIRONMENT: "production" })
        ?.environment,
    ).toBe("production");
  });
});

describe("the telemetry layer", () => {
  it("builds and runs an effect when unconfigured, exporting nothing", async () => {
    const result = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          yield* Effect.log("a log line nobody exports");
          return "served";
        }),
        layer(undefined),
      ),
    );
    // The point: the request still completed. No endpoint is not an outage.
    expect(result).toBe("served");
  });

  it("builds against a configured endpoint without reaching it at construction", async () => {
    // Nothing is sent until there is something to send, so constructing the
    // layer must not require the collector to exist — a deploy would otherwise
    // depend on a third party being up at the moment it starts.
    const built = layer({
      endpoint: "https://collector.invalid",
      headers: { "x-sentry-auth": "k" },
      environment: "test",
    });
    expect(Layer.isLayer(built)).toBe(true);
  });
});
