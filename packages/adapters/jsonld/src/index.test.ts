import { afterEach, describe, expect, it, vi } from "vitest";
import * as Effect from "effect/Effect";
import type { PlatformId } from "../../../domain/src/Ids.ts";
import { SourceAdapter } from "../../src/SourceAdapter.ts";
import { layer } from "./index.ts";

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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("supports", () => {
  it("accepts any platform: the catalogue decides tier, not this adapter", async () => {
    const result = await Effect.runPromise(
      Effect.provide(
        SourceAdapter.use((adapter) => adapter.supports(PLATFORM)),
        layer,
      ),
    );
    expect(result).toBe(true);
  });
});

describe("page", () => {
  it("fetches the page and extracts its JobPosting as a single-page result", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(html, { status: 200 })),
    );

    const page = await Effect.runPromise(
      Effect.provide(
        SourceAdapter.use((adapter) => adapter.page(PLATFORM, PAGE_URL)),
        layer,
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
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 404 })),
    );

    const exit = await Effect.runPromiseExit(
      Effect.provide(
        SourceAdapter.use((adapter) => adapter.page(PLATFORM, PAGE_URL)),
        layer,
      ),
    );

    expect(exit._tag).toBe("Failure");
  });
});
