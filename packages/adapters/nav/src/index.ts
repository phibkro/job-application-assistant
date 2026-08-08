import * as Effect from "effect/Effect";
import type * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import type { PlatformId } from "../../../domain/src/Ids.ts";
import { SourceUnavailable } from "../../../domain/src/Failure.ts";
import type { AcquiredPage, SourceAdapter } from "../../src/SourceAdapter.ts";
import {
  decodeDetail,
  decodeFeedPage,
  isClosedSince,
  NAV_SOURCE_ID,
  summaryListing,
} from "./decode.ts";

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
  since?: Date,
): Effect.Effect<unknown, SourceUnavailable> =>
  Effect.gen(function* () {
    const baseRequest = HttpClientRequest.get(url, {
      headers: {
        Accept: "application/json",
        // RFC 1123, which is what the header is defined in and what NAV
        // parses; an ISO timestamp here is accepted and ignored.
        ...(since === undefined ? {} : { "If-Modified-Since": since.toUTCString() }),
      },
    });
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
 * requests through, the bearer token it presents, and the instant from which
 * a fresh sweep should start.
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
 *
 * `since` is what makes this feed usable at all. NAV publishes an append-only
 * history from June 2023, and a sweep that starts at its head walks years of
 * expired adverts before reaching anything live — thirty pages a run, nothing
 * collected. Their documentation gives the entry point: `If-Modified-Since`,
 * a header rather than a query parameter, which is why every parameter one
 * might guess at is accepted and silently ignored. Sent only on a fresh
 * sweep; once the cursor names a page, the cursor is the position.
 */
export const make = (
  client: HttpClient.HttpClient,
  token: string | undefined,
  since?: Date,
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
      // A cursor naming a page is a position already reached; only the feed
      // root is a fresh start that needs telling where to begin.
      const fresh = !cursor.includes("/feed/");
      const feedJson = yield* fetchJson(
        client,
        resolveUrl(cursor),
        token,
        fresh ? since : undefined,
      );
      const page = yield* decodeFeedPage(feedJson);
      const activeItems = page.items.filter((item) => item.active);

      const decoded = yield* Effect.forEach(activeItems, (item) =>
        item.detailUrl === undefined
          ? summaryListing(item)
          : Effect.flatMap(fetchJson(client, resolveUrl(item.detailUrl), token), (detailJson) =>
              // Closed between the feed page being written and this sweep
              // reaching it: NAV answers with a status and no content. Not a
              // listing any more, and not a decode failure either — the
              // sweep's own absence detection closes what it stops seeing.
              isClosedSince(detailJson)
                ? Effect.succeed(undefined)
                : decodeDetail(detailJson, item),
            ),
      );
      // Entries that closed since the page was written drop out here rather
      // than being reported as listings nobody can apply to.
      const listings = decoded.filter((listing) => listing !== undefined);

      return {
        listings,
        cursor: page.nextUrl ?? cursor,
        more: page.nextUrl !== undefined,
        via: "feed",
      } satisfies AcquiredPage;
    }),
});
