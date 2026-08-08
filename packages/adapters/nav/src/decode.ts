import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type { RawListing } from "../../../domain/src/Job.ts";
import type { PlatformId, SourceId } from "../../../domain/src/Ids.ts";
import { DecodeFailed } from "../../../domain/src/Failure.ts";
import {
  firstPresent,
  isoDatePrefix,
  joinPresence,
  NO_DESCRIPTION,
  presence,
  UNKNOWN_EMPLOYER,
} from "../../shared/src/Text.ts";
import { htmlToText } from "../../shared/src/Html.ts";
import * as NavSchema from "./schema.ts";

/**
 * NAV identity constants.
 *
 * `Schema.brand` documents that it "adds no runtime check" (it only narrows
 * the type), so a cast is the correct construction for a literal that is
 * branded purely for compile-time discipline — decoding it through the
 * schema would spend a parse on a value that cannot fail.
 */
export const NAV_SOURCE_ID = "nav" as SourceId;
const NAV_SOURCE_NAME = "Arbeidsplassen (NAV)";

/**
 * The catalogue seed's id for this platform (migrations/0007_source_catalog_seed.sql)
 * — distinct from `NAV_SOURCE_ID` per this module's own note above. Declared
 * here, not in `index.ts`, so `summaryListing`/`decodeDetail` can stamp
 * `RawListing.platformId` without a caller having to pass in the one value
 * this whole adapter ever produces.
 */
export const NAV_PLATFORM_ID = "arbeidsplassen-nav" as PlatformId;

const navPostingUrl = (uuid: string): string =>
  `https://arbeidsplassen.nav.no/stillinger/stilling/${uuid}`;

const toDecodeFailed =
  (field: string) =>
  (issue: unknown): DecodeFailed =>
    new DecodeFailed({
      source: NAV_SOURCE_ID,
      field,
      detail: issue instanceof Error ? issue.message : String(issue),
    });

/** A feed entry, reduced to the fields the rest of this module needs. */
export interface FeedItem {
  readonly externalId: string;
  readonly detailUrl: string | undefined;
  readonly active: boolean;
  readonly title: string | undefined;
  readonly employerName: string | undefined;
  readonly municipal: string | undefined;
  readonly modifiedAt: string | undefined;
  readonly contentText: string | undefined;
}

export interface FeedPage {
  readonly feedUrl: string | undefined;
  readonly nextUrl: string | undefined;
  readonly items: ReadonlyArray<FeedItem>;
}

const toFeedItem = (item: NavSchema.FeedItem): FeedItem => ({
  externalId: item.feedEntry.uuid,
  detailUrl: presence(item.url),
  active: item.feedEntry.status.toUpperCase() === "ACTIVE",
  title: firstPresent([item.feedEntry.title, item.title]),
  employerName: presence(item.feedEntry.businessName),
  municipal: presence(item.feedEntry.municipal),
  modifiedAt: firstPresent([item.date_modified, item.feedEntry.sistEndret]),
  contentText: presence(item.content_text),
});

/**
 * Decodes a NAV JSON Feed page.
 *
 * This is the shape NAV serves at the feed endpoint: a JSON Feed envelope
 * (`items`, `next_url`) with a NAV-specific `_feed_entry` on each item
 * carrying the fields the feed itself does not standardize (`uuid`,
 * `status`, `municipal`).
 */
export const decodeFeedPage = (input: unknown): Effect.Effect<FeedPage, DecodeFailed> =>
  Schema.decodeUnknownEffect(NavSchema.FeedPage)(input).pipe(
    Effect.mapError(toDecodeFailed("feed")),
    Effect.map((page) => ({
      feedUrl: presence(page.feed_url),
      nextUrl: presence(page.next_url),
      items: page.items.map(toFeedItem),
    })),
  );

/**
 * Builds a `RawListing` from feed data alone, with no detail fetch.
 *
 * Used when a detail fetch is skipped or not yet performed. Fields the feed
 * cannot supply (a real application URL, a deadline) fall back to the NAV
 * posting page and "no deadline" respectively, never to an invented value.
 */
export const summaryListing = (item: FeedItem): Effect.Effect<RawListing, DecodeFailed> => {
  if (!item.active) {
    return Effect.fail(
      new DecodeFailed({
        source: NAV_SOURCE_ID,
        field: "status",
        detail: `feed entry ${item.externalId} is not active; no summary listing exists for it`,
      }),
    );
  }
  const title = item.title;
  if (title === undefined) {
    return Effect.fail(
      new DecodeFailed({
        source: NAV_SOURCE_ID,
        field: "title",
        detail: `feed entry ${item.externalId} has no usable title`,
      }),
    );
  }
  const modifiedAt = item.modifiedAt;
  if (modifiedAt === undefined) {
    return Effect.fail(
      new DecodeFailed({
        source: NAV_SOURCE_ID,
        field: "modifiedAt",
        detail: `feed entry ${item.externalId} has no modified timestamp`,
      }),
    );
  }
  return Effect.succeed({
    sourceId: NAV_SOURCE_ID,
    sourceName: NAV_SOURCE_NAME,
    platformId: NAV_PLATFORM_ID,
    externalId: item.externalId,
    title,
    employerName: item.employerName ?? UNKNOWN_EMPLOYER,
    location: item.municipal ?? "Norway",
    description: item.contentText ?? NO_DESCRIPTION,
    applicationUrl: navPostingUrl(item.externalId),
    publishedAt: modifiedAt,
    deadline: undefined,
    // A feed page never carries a detail fetch's content — that is the
    // entire point of deferred hydration — so every summary listing is
    // unhydrated by construction, not by a caller remembering to say so.
    hydrated: false,
  });
};

/** `city`/`municipal`/`county`, present and de-duplicated, in that order. */
const formatWorkLocation = (location: NavSchema.WorkLocation): string | undefined =>
  joinPresence([location.city, location.municipal, location.county]);

/**
 * Decodes a NAV detail payload into a `RawListing`.
 *
 * The live envelope is `{ uuid, status, sistEndret, ad_content: {...} }` —
 * `NavSchema.Detail` requires exactly that shape, so a payload that is only
 * the advert (no envelope) fails here rather than silently matching as if
 * `ad_content` were absent-and-defaulted.
 *
 * `summary` supplies the feed-derived fallbacks NAV's own detail endpoint
 * sometimes omits (a detail payload recorded without `employer.name` still
 * has one from the feed). It is optional because a detail can be decoded
 * with no feed context at all — the fallbacks it would have fed simply do
 * not fire.
 */
/**
 * Whether a detail response is NAV saying "this advert is gone" rather than
 * returning something malformed.
 *
 * A feed page records the status an entry had when the page was written. By
 * the time a sweep reaches that entry — a year later, at the retention
 * boundary — the advert may have closed, and NAV then answers with `{uuid,
 * sistEndret, status}` and no `ad_content` at all. That is the lifecycle
 * working, not a broken payload, and failing the page on it stops ingestion
 * dead: every one of twenty-five active-in-feed entries sampled from a
 * year-old page had since closed.
 *
 * The distinction is kept narrow on purpose. Missing content on an entry that
 * still calls itself ACTIVE is exactly the corruption `DecodeFailed` exists to
 * report, and still fails.
 */
export const isClosedSince = (input: unknown): boolean => {
  if (typeof input !== "object" || input === null) {
    return false;
  }
  const record = input as { ad_content?: unknown; status?: unknown };
  return (
    (record.ad_content === undefined || record.ad_content === null) &&
    typeof record.status === "string" &&
    record.status.toUpperCase() !== "ACTIVE"
  );
};

export const decodeDetail = (
  input: unknown,
  summary?: FeedItem,
): Effect.Effect<RawListing, DecodeFailed> =>
  Schema.decodeUnknownEffect(NavSchema.Detail)(input).pipe(
    Effect.mapError(toDecodeFailed("ad_content")),
    Effect.flatMap((detail) => {
      const content = detail.ad_content;

      const title = firstPresent([content.title, content.jobtitle, summary?.title]);
      if (title === undefined) {
        return Effect.fail(
          new DecodeFailed({
            source: NAV_SOURCE_ID,
            field: "title",
            detail: `detail ${detail.uuid} has no title, jobtitle, or feed fallback`,
          }),
        );
      }

      const publishedAt = firstPresent([content.published, content.updated, summary?.modifiedAt]);
      if (publishedAt === undefined) {
        return Effect.fail(
          new DecodeFailed({
            source: NAV_SOURCE_ID,
            field: "published",
            detail: `detail ${detail.uuid} has no published, updated, or feed fallback timestamp`,
          }),
        );
      }

      const employerName =
        firstPresent([content.employer?.name, summary?.employerName]) ?? UNKNOWN_EMPLOYER;
      const location =
        firstPresent(content.workLocations?.map(formatWorkLocation) ?? []) ??
        summary?.municipal ??
        "Norway";
      const description =
        firstPresent([
          content.description ? htmlToText(content.description) : undefined,
          summary?.contentText,
        ]) ?? NO_DESCRIPTION;
      const applicationUrl =
        firstPresent([content.applicationUrl, content.link, content.sourceurl]) ??
        navPostingUrl(detail.uuid);
      // NAV accepts free text here and real adverts use it ("Snarest" — "as
      // soon as possible"). Only a genuine calendar date may become the
      // deadline; otherwise the advert's own expiry is the honest answer.
      const deadline = firstPresent([
        isoDatePrefix(content.applicationDue),
        isoDatePrefix(content.expires),
      ]);

      return Effect.succeed<RawListing>({
        sourceId: NAV_SOURCE_ID,
        sourceName: NAV_SOURCE_NAME,
        platformId: NAV_PLATFORM_ID,
        externalId: detail.uuid,
        title,
        employerName,
        location,
        description,
        applicationUrl,
        publishedAt,
        deadline,
        // A detail payload is exactly the content a detail fetch exists to
        // supply, whether this call came from a (now-unused) eager page
        // fetch or from `hydrate` — see `index.ts`.
        hydrated: true,
      });
    }),
  );
