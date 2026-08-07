import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as Effect from "effect/Effect";
import type { PlatformId } from "../../../domain/src/Ids.ts";
import { SourceAdapter } from "../../../../apps/worker/src/services/Acquisition.ts";
import { layer } from "./index.ts";

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`../../../../fixtures/nav/${name}`, import.meta.url), "utf8"));

// The catalogue seed's id for this platform — see migrations/0007_source_catalog_seed.sql.
const NAV_PLATFORM_ID = "arbeidsplassen-nav" as PlatformId;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("supports", () => {
  it("recognizes only the NAV platform id from the catalogue seed", async () => {
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
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/v1/feed?last=true")) {
        return new Response(JSON.stringify(fixture("feed-page.json")), { status: 200 });
      }
      if (url.endsWith("/api/v1/feedentry/active-vacancy-1")) {
        return new Response(JSON.stringify(fixture("detail-active.json")), { status: 200 });
      }
      throw new Error(`unexpected fetch in test: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const page = await Effect.runPromise(
      Effect.provide(
        SourceAdapter.use((adapter) => adapter.page(NAV_PLATFORM_ID, "/api/v1/feed?last=true")),
        layer,
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
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("surfaces a non-2xx feed response as SourceUnavailable rather than throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 503 })),
    );

    const exit = await Effect.runPromiseExit(
      Effect.provide(
        SourceAdapter.use((adapter) => adapter.page(NAV_PLATFORM_ID, "/api/v1/feed?last=true")),
        layer,
      ),
    );

    expect(exit._tag).toBe("Failure");
  });
});
