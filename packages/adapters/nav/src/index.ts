import * as Effect from "effect/Effect";
import type * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import { SourceUnavailable } from "../../../domain/src/Failure.ts";
import type { AcquiredPage, HydrateOutcome, SourceAdapter } from "../../src/SourceAdapter.ts";
import {
  decodeDetail,
  decodeFeedPage,
  isClosedSince,
  NAV_PLATFORM_ID,
  NAV_SOURCE_ID,
  summaryListing,
} from "./decode.ts";

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
/** NAV's own detail endpoint for one feed entry, by the same uuid the feed itself calls `externalId`. */
const detailUrl = (externalId: string): string => resolveUrl(`/api/v1/feedentry/${externalId}`);

export const make = (
  client: HttpClient.HttpClient,
  token: string | undefined,
  since?: Date,
): SourceAdapter["Service"] => ({
  supports: (platform) => Effect.succeed(platform === NAV_PLATFORM_ID),
  // One request: the feed page itself. Every active entry becomes a summary
  // listing built entirely from feed data — no per-entry detail fetch. That
  // used to happen here and is why one page cost 883 requests against
  // Cloudflare's 50-per-invocation limit; see
  // `design-specs/deferred-hydration.md`. The description/deadline/better
  // applicationUrl a detail fetch would add now arrive on demand, through
  // `hydrate` below, only for a vacancy someone actually opens.
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
      const listings = yield* Effect.forEach(activeItems, summaryListing);

      return {
        listings,
        cursor: page.nextUrl ?? cursor,
        more: page.nextUrl !== undefined,
        via: "feed",
      } satisfies AcquiredPage;
    }),
  // The targeted counterpart to the eager fetch `page` no longer performs:
  // one request, for one vacancy someone actually opened. `isClosedSince`
  // is the same lifecycle check `page`'s old eager path used to make inline
  // — an advert that closed between the feed page being written and this
  // fetch reaching it is not a decode failure, it is `ClosedSince`, and the
  // caller (`Hydration`) closes the vacancy rather than hydrating it empty.
  hydrate: (_platform, externalId) =>
    Effect.gen(function* () {
      const detailJson = yield* fetchJson(client, detailUrl(externalId), token);
      if (isClosedSince(detailJson)) {
        return { _tag: "ClosedSince" } satisfies HydrateOutcome;
      }
      const listing = yield* decodeDetail(detailJson);
      return {
        _tag: "Hydrated",
        detail: {
          description: listing.description,
          applicationUrl: listing.applicationUrl,
          deadline: listing.deadline,
        },
      } satisfies HydrateOutcome;
    }),
});
