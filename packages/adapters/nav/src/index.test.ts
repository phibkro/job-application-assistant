import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import type { PlatformId } from "../../../domain/src/Ids.ts";
import { SourceAdapter } from "../../src/SourceAdapter.ts";
import { makePrivateNavCredential, type NavCredential } from "./credential.ts";
import { make } from "./index.ts";

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`../../../../fixtures/nav/${name}`, import.meta.url), "utf8"));

// The catalogue seed's id for this platform — see migrations/0007_source_catalog_seed.sql.
const NAV_PLATFORM_ID = "arbeidsplassen-nav" as PlatformId;

/**
 * A `HttpClient` that never reaches a socket: `respond` maps the request's
 * URL (and headers, for the auth test below) to a Web `Response` — the same
 * shape `fetch` itself would resolve to, which is what makes this a faithful
 * stand-in rather than a shortcut around `fetchJson`'s own status/decode
 * handling.
 */
const clientOf = (respond: (url: string, headers: Headers) => Response): HttpClient.HttpClient =>
  HttpClient.make((request, url) =>
    Effect.succeed(
      HttpClientResponse.fromWeb(request, respond(url.toString(), new Headers(request.headers))),
    ),
  );

const layerOf = (client: HttpClient.HttpClient, token = "test-token") =>
  Layer.succeed(SourceAdapter, make(client, makePrivateNavCredential(token)));

describe("supports", () => {
  it("recognizes only the NAV platform id from the catalogue seed", async () => {
    const layer = layerOf(clientOf(() => new Response("{}")));
    const yes = await Effect.runPromise(
      Effect.provide(
        SourceAdapter.use((adapter) => adapter.supports(NAV_PLATFORM_ID)),
        layer,
      ),
    );
    const no = await Effect.runPromise(
      Effect.provide(
        SourceAdapter.use((adapter) => adapter.supports("some-other-platform" as PlatformId)),
        layer,
      ),
    );

    expect(yes).toBe(true);
    expect(no).toBe(false);
  });
});

describe("page", () => {
  /**
   * Ingesting one bounded feed page makes exactly one HTTP request, asserted
   * by counting requests through this fake `HttpClient` — not by reading the
   * code. The page-size assertion protects progress: NAV's 1,000-entry
   * default cannot finish before the collection duration expires, while a
   * completed page gives the next run a durable cursor.
   */
  it("requests one checkpointable feed page and nothing else", async () => {
    let calls = 0;
    const client = clientOf((url) => {
      calls += 1;
      if (url.endsWith("/api/v1/feed?last=true&pageSize=100")) {
        return new Response(JSON.stringify(fixture("feed-page.json")), { status: 200 });
      }
      throw new Error(`unexpected request in test: ${url} (page() must not fetch detail)`);
    });

    const page = await Effect.runPromise(
      Effect.provide(
        SourceAdapter.use((adapter) => adapter.page(NAV_PLATFORM_ID, "/api/v1/feed?last=true")),
        layerOf(client),
      ),
    );

    expect(page.via).toBe("feed");
    expect(page.more).toBe(true);
    expect(page.cursor).toBe("/api/v1/feed/page-2");
    expect(page.listings).toHaveLength(1);
    expect(page.listings[0]?.externalId).toBe("active-vacancy-1");
    expect(page.listings[0]?.employerName).toBe("Example Technology AS");
    expect(page.listings[0]?.hydrated).toBe(false);
    expect(calls).toBe(1);
  });

  it("presents the bearer token on the feed request", async () => {
    const seenAuth: Array<string | null> = [];
    const client = clientOf((_url, headers) => {
      seenAuth.push(headers.get("authorization"));
      return new Response(JSON.stringify(fixture("feed-page.json")), { status: 200 });
    });

    await Effect.runPromise(
      Effect.provide(
        SourceAdapter.use((adapter) => adapter.page(NAV_PLATFORM_ID, "/api/v1/feed?last=true")),
        layerOf(client, "secret-token"),
      ),
    );

    expect(seenAuth).toEqual(["Bearer secret-token"]);
  });

  it("refreshes once after a 401 and retries with the new credential", async () => {
    const seenAuth: Array<string | null> = [];
    const invalidated: Array<string> = [];
    let calls = 0;
    const credential: NavCredential = {
      get: () => Effect.succeed(calls === 0 ? "stale-token" : "fresh-token"),
      invalidate: (expectedToken) =>
        Effect.sync(() => {
          invalidated.push(expectedToken);
        }),
    };
    const client = clientOf((_url, headers) => {
      calls += 1;
      seenAuth.push(headers.get("authorization"));
      return calls === 1
        ? new Response("unauthorized", { status: 401 })
        : new Response(JSON.stringify(fixture("feed-page.json")), { status: 200 });
    });

    const page = await Effect.runPromise(
      make(client, credential).page(NAV_PLATFORM_ID, "/api/v1/feed?last=true"),
    );

    expect(page.listings).toHaveLength(1);
    expect(seenAuth).toEqual(["Bearer stale-token", "Bearer fresh-token"]);
    expect(invalidated).toEqual(["stale-token"]);
  });

  it("fails after the single retry also returns 401", async () => {
    const seenAuth: Array<string | null> = [];
    const invalidated: Array<string> = [];
    let calls = 0;
    const credential: NavCredential = {
      get: () => Effect.succeed(calls === 0 ? "stale-token" : "fresh-token"),
      invalidate: (expectedToken) =>
        Effect.sync(() => {
          invalidated.push(expectedToken);
        }),
    };
    const client = clientOf((_url, headers) => {
      calls += 1;
      seenAuth.push(headers.get("authorization"));
      return new Response("unauthorized", { status: 401 });
    });

    const exit = await Effect.runPromiseExit(
      make(client, credential).page(NAV_PLATFORM_ID, "/api/v1/feed?last=true"),
    );

    expect(exit._tag).toBe("Failure");
    expect(calls).toBe(2);
    expect(seenAuth).toEqual(["Bearer stale-token", "Bearer fresh-token"]);
    expect(invalidated).toEqual(["stale-token"]);
  });

  it("surfaces a non-2xx feed response as SourceUnavailable rather than throwing", async () => {
    const client = clientOf(() => new Response("nope", { status: 503 }));

    const exit = await Effect.runPromiseExit(
      Effect.provide(
        SourceAdapter.use((adapter) => adapter.page(NAV_PLATFORM_ID, "/api/v1/feed?last=true")),
        layerOf(client),
      ),
    );

    expect(exit._tag).toBe("Failure");
  });

  it("tells a fresh sweep where to start, and does not re-tell a resumed one", async () => {
    const seen: Array<string | null> = [];
    const seenUrls: Array<string> = [];
    const respond = (url: string, headers: Headers): Response => {
      seenUrls.push(url);
      seen.push(headers.get("if-modified-since"));
      return new Response(JSON.stringify(fixture("feed-page.json")), { status: 200 });
    };
    const since = new Date("2025-08-08T00:00:00.000Z");
    const adapter = make(clientOf(respond), makePrivateNavCredential("token"), since);

    await Effect.runPromise(
      Effect.exit(adapter.page(NAV_PLATFORM_ID, "https://pam-stilling-feed.nav.no/api/v1/feed")),
    );
    expect(seen[0]).toBe(since.toUTCString());

    seen.length = 0;
    await Effect.runPromise(Effect.exit(adapter.page(NAV_PLATFORM_ID, "/api/v1/feed/abc-123")));
    expect(seen[0]).toBeNull();
    expect(seenUrls).toEqual([
      "https://pam-stilling-feed.nav.no/api/v1/feed?pageSize=100",
      "https://pam-stilling-feed.nav.no/api/v1/feed/abc-123?pageSize=100",
    ]);
  });

  it("still fails loudly when a feed entry has no usable title", async () => {
    const client = clientOf(
      () =>
        new Response(
          JSON.stringify({
            feed_url: "/api/v1/feed/page-1",
            items: [
              {
                id: "e1",
                url: "/api/v1/feedentry/broken",
                title: "",
                content_text: "",
                date_modified: "2026-08-05T08:00:00Z",
                _feed_entry: { uuid: "broken", status: "ACTIVE", title: "", sistEndret: "" },
              },
            ],
          }),
        ),
    );

    const exit = await Effect.runPromiseExit(
      make(client, makePrivateNavCredential("token")).page(
        NAV_PLATFORM_ID,
        "https://pam-stilling-feed.nav.no/api/v1/feed",
      ),
    );
    expect(JSON.stringify(exit)).toContain("DecodeFailed");
  });
});

describe("hydrate", () => {
  it("fetches one vacancy's detail and returns only the fields a page could not", async () => {
    let calls = 0;
    const client = clientOf((url) => {
      calls += 1;
      expect(url.endsWith("/api/v1/feedentry/active-vacancy-1")).toBe(true);
      return new Response(JSON.stringify(fixture("detail-active.json")), { status: 200 });
    });

    const outcome = await Effect.runPromise(
      Effect.provide(
        SourceAdapter.use((adapter) => adapter.hydrate(NAV_PLATFORM_ID, "active-vacancy-1")),
        layerOf(client, "secret-token"),
      ),
    );

    expect(calls).toBe(1);
    expect(outcome).toEqual({
      _tag: "Hydrated",
      detail: {
        description: "Help customers use technical products.",
        applicationUrl: "https://careers.example/jobs/100?utm_source=nav",
        deadline: "2026-08-25",
      },
    });
  });

  it("presents the bearer token on the detail request", async () => {
    const seenAuth: Array<string | null> = [];
    const client = clientOf((_url, headers) => {
      seenAuth.push(headers.get("authorization"));
      return new Response(JSON.stringify(fixture("detail-active.json")), { status: 200 });
    });

    await Effect.runPromise(
      Effect.provide(
        SourceAdapter.use((adapter) => adapter.hydrate(NAV_PLATFORM_ID, "active-vacancy-1")),
        layerOf(client, "secret-token"),
      ),
    );

    expect(seenAuth).toEqual(["Bearer secret-token"]);
  });

  it("reports ClosedSince rather than DecodeFailed when the advert closed since the feed page was written", async () => {
    const client = clientOf(
      () =>
        new Response(
          JSON.stringify({
            uuid: "gone",
            sistEndret: "2026-08-06T07:20:51+02:00",
            status: "INACTIVE",
          }),
        ),
    );

    const outcome = await Effect.runPromise(
      Effect.provide(
        SourceAdapter.use((adapter) => adapter.hydrate(NAV_PLATFORM_ID, "gone")),
        layerOf(client, "token"),
      ),
    );

    expect(outcome).toEqual({ _tag: "ClosedSince" });
  });

  it("still fails loudly when content is missing from something calling itself active", async () => {
    const client = clientOf(
      () => new Response(JSON.stringify({ uuid: "broken", status: "ACTIVE" })),
    );

    const exit = await Effect.runPromiseExit(
      Effect.provide(
        SourceAdapter.use((adapter) => adapter.hydrate(NAV_PLATFORM_ID, "broken")),
        layerOf(client, "token"),
      ),
    );
    expect(exit._tag).toBe("Failure");
  });

  it("surfaces a non-2xx detail response as SourceUnavailable rather than throwing", async () => {
    const client = clientOf(() => new Response("nope", { status: 503 }));

    const exit = await Effect.runPromiseExit(
      Effect.provide(
        SourceAdapter.use((adapter) => adapter.hydrate(NAV_PLATFORM_ID, "active-vacancy-1")),
        layerOf(client),
      ),
    );
    expect(exit._tag).toBe("Failure");
  });
});
