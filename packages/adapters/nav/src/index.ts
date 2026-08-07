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

const fetchJson = (
  url: string,
  token: string | undefined,
): Effect.Effect<unknown, SourceUnavailable> =>
  Effect.tryPromise({
    try: async (signal) => {
      const headers: Record<string, string> = { Accept: "application/json" };
      if (token !== undefined) headers.Authorization = `Bearer ${token}`;
      const response = await fetch(url, { headers, signal });
      if (!response.ok) {
        throw new SourceUnavailable({ source: NAV_SOURCE_ID, status: response.status });
      }
      return (await response.json()) as unknown;
    },
    catch: (error) =>
      error instanceof SourceUnavailable ? error : new SourceUnavailable({ source: NAV_SOURCE_ID }),
  });

/**
 * The NAV feed adapter, parameterised by the bearer token it presents.
 *
 * NAV's feed rejects an unauthenticated request outright (verified against
 * the live endpoint: a 401, not a reduced-access response) — a fact this
 * adapter did not previously act on, because nothing had called it against
 * the real API yet. The token travels as a plain constructor argument rather
 * than a module-level read of `process.env`: this package is imported into a
 * Cloudflare Worker bundle, where `process` does not exist, so the secret has
 * to arrive through the same `Env` → `runtime/Layers.ts` wiring every other
 * Worker binding does, not through a Node/Bun global this code happens to run
 * under in tests.
 */
export const make = (token: string | undefined): SourceAdapter["Service"] => ({
  supports: (platform) => Effect.succeed(platform === NAV_PLATFORM_ID),
  page: (_platform, cursor) =>
    Effect.gen(function* () {
      const feedJson = yield* fetchJson(resolveUrl(cursor), token);
      const page = yield* decodeFeedPage(feedJson);
      const activeItems = page.items.filter((item) => item.active);

      const listings = yield* Effect.forEach(activeItems, (item) =>
        item.detailUrl === undefined
          ? summaryListing(item)
          : Effect.flatMap(fetchJson(resolveUrl(item.detailUrl), token), (detailJson) =>
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

/**
 * The NAV feed adapter.
 *
 * `page` fetches one feed page and, for every active entry, its detail — the
 * feed alone carries no real description or application URL. A detail that
 * fails to decode fails the whole page rather than silently substituting the
 * feed summary: that silent substitution is the exact defect `DecodeFailed`'s
 * doc comment describes, and the reason it now fails loudly instead.
 *
 * Unparameterised (`make(undefined)`) for this module's own fixture-driven
 * tests, which mock `fetch` directly and do not need a token. Production
 * wiring calls `make(env.NAV_API_TOKEN)` instead — see `runtime/Layers.ts`.
 */
export const adapter: SourceAdapter["Service"] = make(undefined);

/** For code that wants `SourceAdapter` provided directly, such as this module's own tests. */
export const layer = Layer.succeed(SourceAdapter, adapter);
