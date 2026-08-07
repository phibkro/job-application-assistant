import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import type { PlatformId } from "../../../domain/src/Ids.ts";
import { SourceAdapter } from "../../src/SourceAdapter.ts";
import { make } from "./index.ts";

const PLATFORM = "example-careers" as PlatformId;
const PAGE_URL = "https://careers.example/openings/backend-engineer";

const html = `<html><head>
  <script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: "Backend Engineer",
    description: "<p>Build things.</p>",
    datePosted: "2026-08-01",
    hiringOrganization: { name: "Example AS" },
  })}</script>
</head><body></body></html>`;

/** A `HttpClient` that never reaches a socket — see `nav/src/index.test.ts`'s `clientOf`. */
const clientOf = (respond: () => Response): HttpClient.HttpClient =>
  HttpClient.make((request) => Effect.succeed(HttpClientResponse.fromWeb(request, respond())));

const layerOf = (client: HttpClient.HttpClient) => Layer.succeed(SourceAdapter, make(client));

describe("supports", () => {
  it("accepts any platform: the catalogue decides tier, not this adapter", async () => {
    const result = await Effect.runPromise(
      Effect.provide(
        SourceAdapter.use((adapter) => adapter.supports(PLATFORM)),
        layerOf(clientOf(() => new Response(html, { status: 200 }))),
      ),
    );
    expect(result).toBe(true);
  });
});

describe("page", () => {
  it("fetches the page and extracts its JobPosting as a single-page result", async () => {
    const page = await Effect.runPromise(
      Effect.provide(
        SourceAdapter.use((adapter) => adapter.page(PLATFORM, PAGE_URL)),
        layerOf(clientOf(() => new Response(html, { status: 200 }))),
      ),
    );

    expect(page.via).toBe("scripted");
    expect(page.more).toBe(false);
    expect(page.cursor).toBe(PAGE_URL);
    expect(page.listings).toHaveLength(1);
    expect(page.listings[0]?.title).toBe("Backend Engineer");
    expect(page.listings[0]?.employerName).toBe("Example AS");
  });

  it("surfaces a non-2xx response as SourceUnavailable rather than throwing", async () => {
    const exit = await Effect.runPromiseExit(
      Effect.provide(
        SourceAdapter.use((adapter) => adapter.page(PLATFORM, PAGE_URL)),
        layerOf(clientOf(() => new Response("nope", { status: 404 }))),
      ),
    );

    expect(exit._tag).toBe("Failure");
  });
});
