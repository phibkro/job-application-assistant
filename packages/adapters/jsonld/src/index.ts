import * as Effect from "effect/Effect";
import type * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import type { PlatformId } from "../../../domain/src/Ids.ts";
import type { SourceId } from "../../../domain/src/Ids.ts";
import { SourceUnavailable } from "../../../domain/src/Failure.ts";
import type { AcquiredPage, SourceAdapter } from "../../src/SourceAdapter.ts";
import { extractJobPostings } from "./Extract.ts";

/**
 * The JSON-LD scripted adapter, parameterised by the `HttpClient` it reads
 * pages through — the same reason `@job-index/adapters/nav`'s `make` takes
 * one: `fetch` is a platform capability handed in by whoever composes this
 * adapter, not a global this module reaches for itself, so a test can hand it
 * a fake with no network in reach (see `index.test.ts`).
 *
 * Unlike NAV, this is not tied to one platform: it reads whichever page a
 * catalogued "Scripted" source names and extracts any `JobPosting` embedded
 * in it. `supports` says yes unconditionally — the catalogue is what decided
 * this platform's tier is "Scripted"; this adapter's only job is to be able
 * to act on that decision, not to re-approve it against a private allowlist.
 *
 * `cursor` is the absolute URL of the page to read. There is no pagination
 * convention in JSON-LD job markup generically, so a page is always the
 * whole result: `more` is always `false`.
 */
export const make = (client: HttpClient.HttpClient): SourceAdapter["Service"] => ({
  supports: () => Effect.succeed(true),
  page: (platform, cursor) =>
    Effect.gen(function* () {
      const html = yield* fetchText(client, platform, cursor);
      const listings = yield* extractJobPostings(html, {
        sourceId: platform as unknown as SourceId,
        sourceName: platform,
        pageUrl: cursor,
      });
      return { listings, cursor, more: false, via: "scripted" } satisfies AcquiredPage;
    }),
});

const fetchText = (
  client: HttpClient.HttpClient,
  platform: PlatformId,
  url: string,
): Effect.Effect<string, SourceUnavailable> =>
  Effect.gen(function* () {
    const request = HttpClientRequest.get(url, { headers: { Accept: "text/html" } });
    const response = yield* client
      .execute(request)
      .pipe(Effect.mapError(() => new SourceUnavailable({ source: platform })));
    if (response.status < 200 || response.status >= 300) {
      return yield* Effect.fail(
        new SourceUnavailable({ source: platform, status: response.status }),
      );
    }
    return yield* response.text.pipe(
      Effect.mapError(() => new SourceUnavailable({ source: platform })),
    );
  });
