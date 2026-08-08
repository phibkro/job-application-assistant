import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import type { PlatformId } from "../../../domain/src/Ids.ts";
import { SourceAdapter } from "../../src/SourceAdapter.ts";
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

const layerOf = (client: HttpClient.HttpClient, token: string | undefined) =>
  Layer.succeed(SourceAdapter, make(client, token));

describe("supports", () => {
  it("recognizes only the NAV platform id from the catalogue seed", async () => {
    const layer = layerOf(
      clientOf(() => new Response("{}")),
      undefined,
    );
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
  it("fetches the feed, decodes the active entry's detail, and skips the inactive one", async () => {
    let calls = 0;
    const client = clientOf((url) => {
      calls += 1;
      if (url.endsWith("/api/v1/feed?last=true")) {
        return new Response(JSON.stringify(fixture("feed-page.json")), { status: 200 });
      }
      if (url.endsWith("/api/v1/feedentry/active-vacancy-1")) {
        return new Response(JSON.stringify(fixture("detail-active.json")), { status: 200 });
      }
      throw new Error(`unexpected request in test: ${url}`);
    });

    const page = await Effect.runPromise(
      Effect.provide(
        SourceAdapter.use((adapter) => adapter.page(NAV_PLATFORM_ID, "/api/v1/feed?last=true")),
        layerOf(client, undefined),
      ),
    );

    expect(page.via).toBe("feed");
    expect(page.more).toBe(true);
    expect(page.cursor).toBe("/api/v1/feed/page-2");
    expect(page.listings).toHaveLength(1);
    expect(page.listings[0]?.externalId).toBe("active-vacancy-1");
    expect(page.listings[0]?.employerName).toBe("Example Technology AS");
    // Only the active entry's detail is fetched — the inactive one costs
    // nothing extra.
    expect(calls).toBe(2);
  });

  it("presents the bearer token on every request — the gap a live run once caught (a 401, not a reduced-access response)", async () => {
    const seenAuth: Array<string | null> = [];
    const client = clientOf((url, headers) => {
      seenAuth.push(headers.get("authorization"));
      if (url.endsWith("/api/v1/feed?last=true")) {
        return new Response(JSON.stringify(fixture("feed-page.json")), { status: 200 });
      }
      return new Response(JSON.stringify(fixture("detail-active.json")), { status: 200 });
    });

    await Effect.runPromise(
      Effect.provide(
        SourceAdapter.use((adapter) => adapter.page(NAV_PLATFORM_ID, "/api/v1/feed?last=true")),
        layerOf(client, "secret-token"),
      ),
    );

    expect(seenAuth).toEqual(["Bearer secret-token", "Bearer secret-token"]);
  });

  it("surfaces a non-2xx feed response as SourceUnavailable rather than throwing", async () => {
    const client = clientOf(() => new Response("nope", { status: 503 }));

    const exit = await Effect.runPromiseExit(
      Effect.provide(
        SourceAdapter.use((adapter) => adapter.page(NAV_PLATFORM_ID, "/api/v1/feed?last=true")),
        layerOf(client, undefined),
      ),
    );

    expect(exit._tag).toBe("Failure");
  });

  it("tells a fresh sweep where to start, and does not re-tell a resumed one", async () => {
    const seen: Array<string | null> = [];
    const respond = (url: string, headers: Headers): Response => {
      seen.push(headers.get("if-modified-since"));
      return new Response(
        JSON.stringify(
          url.includes("/feed/") ? fixture("detail-active.json") : fixture("feed-page.json"),
        ),
        { status: 200 },
      );
    };
    const since = new Date("2025-08-08T00:00:00.000Z");
    const adapter = make(clientOf(respond), "token", since);

    await Effect.runPromise(
      Effect.exit(adapter.page(NAV_PLATFORM_ID, "https://pam-stilling-feed.nav.no/api/v1/feed")),
    );
    // RFC 1123, because that is what the header is defined in. NAV accepts an
    // ISO timestamp and ignores it, which looks exactly like it worked — the
    // same shape as every query parameter one might guess at instead.
    expect(seen[0]).toBe(since.toUTCString());

    seen.length = 0;
    await Effect.runPromise(Effect.exit(adapter.page(NAV_PLATFORM_ID, "/api/v1/feed/abc-123")));
    // A cursor naming a page is already a position. Re-sending the boundary
    // would rewind the walk to it on every run.
    expect(seen[0]).toBeNull();
  });

  it("skips an advert that closed between the feed page and this sweep, rather than failing the page", async () => {
    // What NAV actually returns for an entry the feed still lists as active
    // but which has since closed: a status and nothing else. Every one of
    // twenty-five sampled from a year-old page looked like this, and treating
    // it as corruption stopped ingestion at page zero.
    const client = clientOf((url) =>
      url.includes("/feedentry/") || url.includes("/feed/")
        ? new Response(
            JSON.stringify({
              uuid: "gone",
              sistEndret: "2026-08-06T07:20:51+02:00",
              status: "INACTIVE",
            }),
          )
        : new Response(JSON.stringify(fixture("feed-page.json"))),
    );

    const page = await Effect.runPromise(
      make(client, "token").page(NAV_PLATFORM_ID, "https://pam-stilling-feed.nav.no/api/v1/feed"),
    );
    expect(page.listings).toEqual([]);
  });

  it("still fails loudly when content is missing from something calling itself active", async () => {
    const client = clientOf((url) =>
      url.includes("/feedentry/") || url.includes("/feed/")
        ? new Response(JSON.stringify({ uuid: "broken", status: "ACTIVE" }))
        : new Response(JSON.stringify(fixture("feed-page.json"))),
    );

    const exit = await Effect.runPromiseExit(
      make(client, "token").page(NAV_PLATFORM_ID, "https://pam-stilling-feed.nav.no/api/v1/feed"),
    );
    expect(JSON.stringify(exit)).toContain("DecodeFailed");
  });
});
