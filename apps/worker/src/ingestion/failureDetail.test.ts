import { describe, expect, it } from "vitest";
import {
  AdapterUnavailable,
  DecodeFailed,
  RateLimited,
  RendererUnavailable,
  SourceUnavailable,
  Unauthorized,
} from "@job-index/domain/Failure";
import { describeFailure, isRetryable } from "./failureDetail.ts";

describe("isRetryable", () => {
  it("SourceUnavailable and RateLimited are transient — worth a bounded retry", () => {
    expect(isRetryable(new SourceUnavailable({ source: "nav" }))).toBe(true);
    expect(isRetryable(new RateLimited({ source: "nav", retryAfterMs: 1000 }))).toBe(true);
  });

  it("Unauthorized, DecodeFailed, AdapterUnavailable, RendererUnavailable are not — retrying changes nothing", () => {
    expect(isRetryable(new Unauthorized({ source: "nav" }))).toBe(false);
    expect(
      isRetryable(new DecodeFailed({ source: "nav", field: "title", detail: "missing" })),
    ).toBe(false);
    expect(isRetryable(new AdapterUnavailable({ platform: "nav", tier: "Unknown" }))).toBe(false);
    expect(isRetryable(new RendererUnavailable({ platform: "nav" }))).toBe(false);
  });
});

describe("describeFailure", () => {
  it("names the field that disagreed for a decode failure — the failure that hid for a release, per Failure.ts", () => {
    expect(
      describeFailure(new DecodeFailed({ source: "nav", field: "title", detail: "missing" })),
    ).toBe("title: missing");
  });

  it("names the HTTP status when the source gave one, and says so plainly when it did not", () => {
    expect(describeFailure(new SourceUnavailable({ source: "nav", status: 503 }))).toBe("HTTP 503");
    expect(describeFailure(new SourceUnavailable({ source: "nav" }))).toBe("no response");
  });

  it("names the requested backoff for a rate limit", () => {
    expect(describeFailure(new RateLimited({ source: "nav", retryAfterMs: 5000 }))).toBe(
      "rate limited; retry after 5000ms",
    );
  });

  it("names the missing tier for an unavailable adapter, and the missing renderer for the agent tier", () => {
    expect(describeFailure(new AdapterUnavailable({ platform: "nav", tier: "Scripted" }))).toBe(
      "no adapter registered for tier Scripted",
    );
    expect(describeFailure(new RendererUnavailable({ platform: "nav" }))).toBe(
      "agent tier requested but no renderer is configured",
    );
  });
});
