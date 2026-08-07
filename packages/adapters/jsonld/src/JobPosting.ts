import * as Schema from "effect/Schema";
import * as Effect from "effect/Effect";
import type { RawListing } from "../../../domain/src/Job.ts";
import type { SourceId } from "../../../domain/src/Ids.ts";
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

/**
 * The schema.org `JobPosting` fields this adapter reads.
 *
 * `hiringOrganization`, `jobLocation`, and `identifier` are left as
 * `Schema.Unknown` rather than modeled precisely: schema.org defines each of
 * them as legitimately polymorphic (an organization can be a bare string or
 * an `Organization` node; a location can be one `Place` or an array of
 * them), so a strict shape here would reject conforming markup instead of
 * catching a real mismatch. `title`/`name`/`description` are the fields a
 * node has to get right to be usable, so those alone are typed as strings.
 */
export const JobPosting = Schema.Struct({
  "@type": Schema.Union([Schema.String, Schema.Array(Schema.String)]),
  title: Schema.optional(Schema.NullOr(Schema.String)),
  name: Schema.optional(Schema.NullOr(Schema.String)),
  description: Schema.optional(Schema.NullOr(Schema.String)),
  identifier: Schema.optional(Schema.Unknown),
  datePosted: Schema.optional(Schema.NullOr(Schema.String)),
  validThrough: Schema.optional(Schema.NullOr(Schema.String)),
  url: Schema.optional(Schema.NullOr(Schema.String)),
  hiringOrganization: Schema.optional(Schema.Unknown),
  jobLocation: Schema.optional(Schema.Unknown),
});
export type JobPosting = typeof JobPosting.Type;

/** `@type` may be a bare string or an array of them (multi-typed nodes). */
export const hasJobPostingType = (node: unknown): boolean => {
  if (!isRecord(node)) return false;
  const type = node["@type"];
  if (typeof type === "string") return type === "JobPosting";
  if (Array.isArray(type)) return type.includes("JobPosting");
  return false;
};

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

/** `hiringOrganization` is a bare string or an `Organization` with `name`. */
const organizationName = (value: unknown): string | undefined => {
  if (typeof value === "string") return presence(value);
  if (isRecord(value)) return presence(asString(value.name));
  return undefined;
};

/** `addressCountry` is a bare string or a `Country` with `name`. */
const countryName = (value: unknown): string | undefined => {
  if (typeof value === "string") return presence(value);
  if (isRecord(value)) return presence(asString(value.name));
  return undefined;
};

/** A `PostalAddress`, or a bare string standing in for one. */
const addressString = (value: unknown): string | undefined => {
  if (typeof value === "string") return presence(value);
  if (isRecord(value)) {
    return joinPresence([
      asString(value.addressLocality),
      asString(value.addressRegion),
      countryName(value.addressCountry),
    ]);
  }
  return undefined;
};

/** A `Place`: usually `{ address: PostalAddress }`, sometimes the address inlined. */
const placeString = (value: unknown): string | undefined => {
  if (typeof value === "string") return presence(value);
  if (isRecord(value)) return addressString(value.address) ?? addressString(value);
  return undefined;
};

/** `jobLocation` is one `Place` or an array of them; the first usable one wins. */
export const locationFromJobLocation = (value: unknown): string | undefined => {
  if (Array.isArray(value)) return firstPresent(value.map(placeString));
  return placeString(value);
};

/** `identifier` is a bare string or a `PropertyValue` with `.value`. */
export const identifierFromValue = (value: unknown): string | undefined => {
  if (typeof value === "string") return presence(value);
  if (isRecord(value)) return presence(asString(value.value));
  return undefined;
};

export interface JobPostingContext {
  readonly sourceId: SourceId;
  readonly sourceName: string;
  /** The absolute URL of the page the node was extracted from. */
  readonly pageUrl: string;
}

const decodeFailed = (context: JobPostingContext, field: string, detail: string): DecodeFailed =>
  new DecodeFailed({ source: context.sourceId, field, detail });

/**
 * Converts a decoded `JobPosting` node to a `RawListing`.
 *
 * `title` and `datePosted` are the only fields this refuses to invent a
 * value for: a listing with no title is not usable under any name, and a
 * fabricated publish timestamp would be data this adapter does not have,
 * dressed up as data it does.
 */
export const toRawListing = (
  posting: JobPosting,
  context: JobPostingContext,
): Effect.Effect<RawListing, DecodeFailed> => {
  const title = firstPresent([posting.title, posting.name]);
  if (title === undefined) {
    return Effect.fail(
      decodeFailed(context, "title", "JobPosting node has neither title nor name"),
    );
  }

  const publishedAt = presence(posting.datePosted);
  if (publishedAt === undefined) {
    return Effect.fail(
      decodeFailed(context, "datePosted", `JobPosting "${title}" has no datePosted`),
    );
  }

  const employerName = organizationName(posting.hiringOrganization) ?? UNKNOWN_EMPLOYER;
  const location = locationFromJobLocation(posting.jobLocation) ?? "Not specified";
  const rawDescription = presence(posting.description);
  const description = rawDescription !== undefined ? htmlToText(rawDescription) : NO_DESCRIPTION;
  const externalId = firstPresent([identifierFromValue(posting.identifier), posting.url]) ?? title;
  const applicationUrl = resolveUrl(posting.url, context.pageUrl);
  const deadline = isoDatePrefix(posting.validThrough);

  return Effect.succeed({
    sourceId: context.sourceId,
    sourceName: context.sourceName,
    externalId,
    title,
    employerName,
    location,
    description,
    applicationUrl,
    publishedAt,
    deadline,
  });
};

/**
 * Resolves the posting's own `url` against the page it was found on, so a
 * relative `url` ("/jobs/100") still reaches `RawListing.applicationUrl` as
 * an absolute one. Falls back to the page itself when `url` is absent —
 * some postings are only ever reachable through the page that listed them.
 */
const resolveUrl = (url: string | null | undefined, pageUrl: string): string => {
  const found = presence(url);
  if (found === undefined) return pageUrl;
  try {
    return new URL(found, pageUrl).toString();
  } catch {
    return pageUrl;
  }
};

if (import.meta.vitest) {
  const { describe, it, expect } = import.meta.vitest;

  describe("locationFromJobLocation", () => {
    it("reads a PostalAddress nested under a Place", () => {
      const place = {
        "@type": "Place",
        address: { "@type": "PostalAddress", addressLocality: "Oslo", addressCountry: "NO" },
      };
      expect(locationFromJobLocation(place)).toBe("Oslo, NO");
    });
  });
}
