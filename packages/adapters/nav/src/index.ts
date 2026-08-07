import * as Effect from "effect/Effect";
import type * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import type { PlatformId } from "../../../domain/src/Ids.ts";
import { SourceUnavailable } from "../../../domain/src/Failure.ts";
import type { AcquiredPage, SourceAdapter } from "../../src/SourceAdapter.ts";
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

const fetchJson = (
  client: HttpClient.HttpClient,
  url: string,
  token: string | undefined,
): Effect.Effect<unknown, SourceUnavailable> =>
  Effect.gen(function* () {
    const baseRequest = HttpClientRequest.get(url, { headers: { Accept: "application/json" } });
    const request =
      token === undefined ? baseRequest : HttpClientRequest.bearerToken(baseRequest, token);
    const response = yield* client
      .execute(request)
      .pipe(Effect.mapError(() => new SourceUnavailable({ source: NAV_SOURCE_ID })));
    if (response.status < 200 || response.status >= 300) {
      return yield* Effect.fail(
        new SourceUnavailable({ source: NAV_SOURCE_ID, status: response.status }),
      );
    }
    return yield* response.json.pipe(
      Effect.mapError(() => new SourceUnavailable({ source: NAV_SOURCE_ID })),
    );
  });

/**
 * The NAV feed adapter, parameterised by the `HttpClient` it executes
 * requests through and the bearer token it presents.
 *
 * NAV's feed rejects an unauthenticated request outright (verified against
 * the live endpoint: a 401, not a reduced-access response) — a fact this
 * adapter did not previously act on, because nothing had called it against
 * the real API yet. Both the client and the token travel as plain constructor
 * arguments rather than a module-level read of a global: this package is
 * imported into a Cloudflare Worker bundle, where `fetch` is a platform
 * capability, not a free function to reach for from inside a `SourceAdapter`
 * — production wiring hands in the one concrete `HttpClient`
 * `runtime/Layers.ts` builds, and this module's own tests hand in a fake that
 * touches no network at all (see `index.test.ts`).
 */
export const make = (
  client: HttpClient.HttpClient,
  token: string | undefined,
): SourceAdapter["Service"] => ({
  supports: (platform) => Effect.succeed(platform === NAV_PLATFORM_ID),
  // Fetches one feed page and, for every active entry, its detail — the
  // feed alone carries no real description or application URL. A detail
  // that fails to decode fails the whole page rather than silently
  // substituting the feed summary: that silent substitution is the exact
  // defect `DecodeFailed`'s doc comment describes, and the reason it now
  // fails loudly instead.
  page: (_platform, cursor) =>
    Effect.gen(function* () {
      const feedJson = yield* fetchJson(client, resolveUrl(cursor), token);
      const page = yield* decodeFeedPage(feedJson);
      const activeItems = page.items.filter((item) => item.active);

      const listings = yield* Effect.forEach(activeItems, (item) =>
        item.detailUrl === undefined
          ? summaryListing(item)
          : Effect.flatMap(fetchJson(client, resolveUrl(item.detailUrl), token), (detailJson) =>
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
});
