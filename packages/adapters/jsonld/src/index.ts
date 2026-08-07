import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type { PlatformId } from "../../../domain/src/Ids.ts";
import type { SourceId } from "../../../domain/src/Ids.ts";
import { SourceUnavailable } from "../../../domain/src/Failure.ts";
import { SourceAdapter } from "../../src/SourceAdapter.ts";
import type { AcquiredPage } from "../../src/SourceAdapter.ts";
import { extractJobPostings } from "./Extract.ts";

/**
 * The JSON-LD scripted adapter.
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
export const adapter: SourceAdapter["Service"] = {
  supports: () => Effect.succeed(true),
  page: (platform, cursor) =>
    Effect.gen(function* () {
      const html = yield* fetchText(platform, cursor);
      const listings = yield* extractJobPostings(html, {
        sourceId: platform as unknown as SourceId,
        sourceName: platform,
        pageUrl: cursor,
      });
      return { listings, cursor, more: false, via: "scripted" } satisfies AcquiredPage;
    }),
};

/** For code that wants `SourceAdapter` provided directly, such as this module's own tests. */
export const layer = Layer.succeed(SourceAdapter, adapter);

const fetchText = (platform: PlatformId, url: string): Effect.Effect<string, SourceUnavailable> =>
  Effect.tryPromise({
    try: async (signal) => {
      const response = await fetch(url, { headers: { Accept: "text/html" }, signal });
      if (!response.ok) {
        throw new SourceUnavailable({ source: platform, status: response.status });
      }
      return await response.text();
    },
    catch: (error) =>
      error instanceof SourceUnavailable ? error : new SourceUnavailable({ source: platform }),
  });
