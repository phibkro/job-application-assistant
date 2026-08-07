import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type { PlatformId } from "../../../domain/src/Ids.ts";
import { SourceUnavailable } from "../../../domain/src/Failure.ts";
import { SourceAdapter } from "../../src/SourceAdapter.ts";
import type { AcquiredPage } from "../../src/SourceAdapter.ts";
import { decodeDetail, decodeFeedPage, NAV_SOURCE_ID, summaryListing } from "./decode.ts";

// The catalogue seed (migrations/0007_source_catalog_seed.sql) names this
// platform `arbeidsplassen-nav` — distinct from the `nav` RawListing.sourceId
// the Rust implementation already committed to, per `Ids.ts`'s note that
// `PlatformId` and `SourceId` are different identifiers.
const NAV_PLATFORM_ID = "arbeidsplassen-nav" as PlatformId;

const NAV_BASE_URL = "https://pam-stilling-feed.nav.no";

const resolveUrl = (path: string): string =>
  path.startsWith("http://") || path.startsWith("https://")
    ? path
    : `${NAV_BASE_URL}${path.startsWith("/") ? "" : "/"}${path}`;

const fetchJson = (url: string): Effect.Effect<unknown, SourceUnavailable> =>
  Effect.tryPromise({
    try: async (signal) => {
      const response = await fetch(url, { headers: { Accept: "application/json" }, signal });
      if (!response.ok) {
        throw new SourceUnavailable({ source: NAV_SOURCE_ID, status: response.status });
      }
      return (await response.json()) as unknown;
    },
    catch: (error) =>
      error instanceof SourceUnavailable ? error : new SourceUnavailable({ source: NAV_SOURCE_ID }),
  });

/**
 * The NAV feed adapter.
 *
 * `page` fetches one feed page and, for every active entry, its detail — the
 * feed alone carries no real description or application URL. A detail that
 * fails to decode fails the whole page rather than silently substituting the
 * feed summary: that silent substitution is the exact defect `DecodeFailed`'s
 * doc comment describes, and the reason it now fails loudly instead.
 */
export const adapter: SourceAdapter["Service"] = {
  supports: (platform) => Effect.succeed(platform === NAV_PLATFORM_ID),
  page: (_platform, cursor) =>
    Effect.gen(function* () {
      const feedJson = yield* fetchJson(resolveUrl(cursor));
      const page = yield* decodeFeedPage(feedJson);
      const activeItems = page.items.filter((item) => item.active);

      const listings = yield* Effect.forEach(activeItems, (item) =>
        item.detailUrl === undefined
          ? summaryListing(item)
          : Effect.flatMap(fetchJson(resolveUrl(item.detailUrl)), (detailJson) =>
              decodeDetail(detailJson, item),
            ),
      );

      return {
        listings,
        cursor: page.nextUrl ?? cursor,
        more: page.nextUrl !== undefined,
        via: "feed",
      } satisfies AcquiredPage;
    }),
};

/** For code that wants `SourceAdapter` provided directly, such as this module's own tests. */
export const layer = Layer.succeed(SourceAdapter, adapter);
