import * as Effect from "effect/Effect";
import type * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import type * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
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
import type { NavCredential } from "./credential.ts";

export {
  makeNavCredential,
  makePrivateNavCredential,
  makePublicNavCredential,
  parsePublicToken,
  PUBLIC_TOKEN_URL,
} from "./credential.ts";
export type { NavCredential } from "./credential.ts";

const NAV_BASE_URL = "https://pam-stilling-feed.nav.no";
const FEED_PAGE_SIZE = 100;

const resolveUrl = (path: string): string =>
  path.startsWith("http://") || path.startsWith("https://")
    ? path
    : `${NAV_BASE_URL}${path.startsWith("/") ? "" : "/"}${path}`;

const readJson = (
  response: HttpClientResponse.HttpClientResponse,
): Effect.Effect<unknown, SourceUnavailable> => {
  if (response.status < 200 || response.status >= 300) {
    return Effect.fail(new SourceUnavailable({ source: NAV_SOURCE_ID, status: response.status }));
  }
  return response.json.pipe(
    Effect.mapError(() => new SourceUnavailable({ source: NAV_SOURCE_ID })),
  );
};

const fetchJson = (
  client: HttpClient.HttpClient,
  credential: NavCredential,
  url: string,
  since?: Date,
): Effect.Effect<unknown, SourceUnavailable> =>
  Effect.gen(function* () {
    const execute = (token: string) => {
      const baseRequest = HttpClientRequest.get(url, {
        headers: {
          Accept: "application/json",
          // RFC 1123, which is what the header is defined in and what NAV
          // parses; an ISO timestamp here is accepted and ignored.
          ...(since === undefined ? {} : { "If-Modified-Since": since.toUTCString() }),
        },
      });
      return client
        .execute(HttpClientRequest.bearerToken(baseRequest, token))
        .pipe(Effect.mapError(() => new SourceUnavailable({ source: NAV_SOURCE_ID })));
    };
    const token = yield* credential.get();
    const response = yield* execute(token);
    if (response.status === 401) {
      yield* credential.invalidate(token);
      const refreshed = yield* credential.get();
      const retry = yield* execute(refreshed);
      return yield* readJson(retry);
    }
    return yield* readJson(response);
  });

/**
 * The NAV feed adapter, parameterised by the `HttpClient` it executes
 * requests through, the credential it resolves per request, and the instant
 * from which a fresh sweep should start.
 *
 * NAV's feed rejects an unauthenticated request outright (verified against
 * the live endpoint: a 401, not a reduced-access response). The credential
 * capability owns acquisition and refresh, so this adapter never captures a
 * token string or knows whether it came from a runtime secret or NAV's
 * public endpoint. Production wiring hands in the one concrete `HttpClient`
 * and shared credential; tests hand in fakes that touch no network.
 *
 * `since` makes a fresh sweep start at the retention boundary rather than
 * walking NAV's append-only history from June 2023. `pageSize` is the other
 * operational bound: NAV defaults to 1,000 entries, which cannot be folded
 * into D1 before one scheduled run's duration budget expires. One hundred
 * entries leaves enough time to finish and checkpoint a page; every request
 * sets it because NAV's `next_url` does not carry the requested size forward.
 * `If-Modified-Since` is sent only on a fresh sweep; once the cursor names a
 * page, the cursor is the position.
 */
/** NAV's own detail endpoint for one feed entry, by the same uuid the feed itself calls `externalId`. */
const detailUrl = (externalId: string): string => resolveUrl(`/api/v1/feedentry/${externalId}`);

export const make = (
  client: HttpClient.HttpClient,
  credential: NavCredential,
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
      const feedUrl = new URL(resolveUrl(cursor));
      feedUrl.searchParams.set("pageSize", String(FEED_PAGE_SIZE));
      const feedJson = yield* fetchJson(
        client,
        credential,
        feedUrl.toString(),
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
      const detailJson = yield* fetchJson(client, credential, detailUrl(externalId));
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
