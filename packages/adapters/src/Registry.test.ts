import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import type { PlatformId } from "@job-index/domain/Ids";
import { make as makeNavAdapter, makePrivateNavCredential } from "@job-index/adapters/nav";
import type { SourceAdapter } from "./SourceAdapter.ts";
import { resolve, resolveHydrate } from "./Registry.ts";
import type { Registration } from "./Registry.ts";

const NAV_PLATFORM_ID = "arbeidsplassen-nav" as PlatformId;

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`../../../fixtures/nav/${name}`, import.meta.url), "utf8"));

/** A `HttpClient` that never reaches a socket — see `nav/src/index.test.ts`'s `clientOf`. */
const clientOf = (respond: (url: string) => Response): HttpClient.HttpClient =>
  HttpClient.make((request, url) =>
    Effect.succeed(HttpClientResponse.fromWeb(request, respond(url.toString()))),
  );

// Only `supports` is exercised on this instance by the tests below — neither
// asks it for a page, so its client never has to answer one.
const inertNavAdapter = makeNavAdapter(
  clientOf((url) => {
    throw new Error(`unexpected request in test: ${url}`);
  }),
  makePrivateNavCredential("test-token"),
);

describe("resolve", () => {
  it("dispatches to the reference NAV adapter for its registered tier and platform", async () => {
    const navAdapter = makeNavAdapter(
      clientOf((url) => {
        if (url.endsWith("/api/v1/feed?last=true&pageSize=100")) {
          return new Response(JSON.stringify(fixture("feed-page.json")), { status: 200 });
        }
        if (url.endsWith("/api/v1/feedentry/active-vacancy-1")) {
          return new Response(JSON.stringify(fixture("detail-active.json")), { status: 200 });
        }
        throw new Error(`unexpected request in test: ${url}`);
      }),
      makePrivateNavCredential("test-token"),
    );
    const registrations: ReadonlyArray<Registration> = [{ tier: "Feed", adapter: navAdapter }];

    const page = await Effect.runPromise(
      resolve(registrations, "Feed", NAV_PLATFORM_ID, "/api/v1/feed?last=true"),
    );

    expect(page.via).toBe("feed");
    expect(page.listings).toHaveLength(1);
  });

  it("dispatches hydrate to the same registration page uses", async () => {
    const navAdapter = makeNavAdapter(
      clientOf((url) => {
        if (url.endsWith("/api/v1/feedentry/active-vacancy-1")) {
          return new Response(JSON.stringify(fixture("detail-active.json")), { status: 200 });
        }
        throw new Error(`unexpected request in test: ${url}`);
      }),
      makePrivateNavCredential("test-token"),
    );
    const registrations: ReadonlyArray<Registration> = [{ tier: "Feed", adapter: navAdapter }];

    const outcome = await Effect.runPromise(
      resolveHydrate(registrations, "Feed", NAV_PLATFORM_ID, "active-vacancy-1"),
    );

    expect(outcome._tag).toBe("Hydrated");
  });

  it("fails with AdapterUnavailable when no registration matches the tier", async () => {
    const registrations: ReadonlyArray<Registration> = [{ tier: "Feed", adapter: inertNavAdapter }];

    const exit = await Effect.runPromiseExit(
      resolve(registrations, "Scripted", NAV_PLATFORM_ID, "cursor"),
    );

    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      expect(String(exit.cause)).toContain("AdapterUnavailable");
    }
  });

  it("tries the next same-tier registration when an earlier one does not support the platform", async () => {
    // Two adapters share a tier — the NAV adapter (which only supports its
    // own platform) and a stub that supports everything. A platform id NAV
    // refuses must still resolve, proving disambiguation is per-adapter via
    // `supports`, not "first registration at this tier wins".
    const otherPlatform = "example-careers" as PlatformId;
    const fallback: SourceAdapter["Service"] = {
      supports: () => Effect.succeed(true),
      page: () =>
        Effect.succeed({ listings: [], cursor: "done", more: false, via: "feed" as const }),
      hydrate: () => Effect.die("unused"),
    };
    const registrations: ReadonlyArray<Registration> = [
      { tier: "Feed", adapter: inertNavAdapter },
      { tier: "Feed", adapter: fallback },
    ];

    const page = await Effect.runPromise(resolve(registrations, "Feed", otherPlatform, "cursor"));

    expect(page.cursor).toBe("done");
  });
});
