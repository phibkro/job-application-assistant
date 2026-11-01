import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { DecodeFailed } from "../../../domain/src/Failure.ts";
import type { RawListing } from "../../../domain/src/Job.ts";
import { fact, IR_VERSION } from "../../../domain/src/observation/Ir.ts";
import type {
  Fact,
  ListingFacts,
  ObservationContent,
  RawClaim,
} from "../../../domain/src/observation/Ir.ts";
import { htmlToText } from "../../shared/src/Html.ts";
import {
  isoDatePrefix,
  NO_DESCRIPTION,
  presence,
  UNKNOWN_EMPLOYER,
} from "../../shared/src/Text.ts";
import { NAV_PLATFORM_ID, NAV_SOURCE_ID, NAV_SOURCE_NAME, navPostingUrl } from "./ids.ts";
import * as NavSchema from "./schema.ts";

/**
 * The NAV importer onto the observation IR (WS-0022 §4), and `lower`, which turns an observation back into the
 * `RawListing` the existing corpus consumes, byte-for-byte what `decode.ts` produced before (pinned by
 * `observe.test.ts` against `summaryListing`/`decodeDetail`).
 *
 * Every fact's evidence names the payload paths it came from; residue is every other non-null leaf, so nothing the
 * payload carries is dropped. The one declared transform is `description`, kept as text (`htmlToText`), not HTML. What is new against `decode.ts`: the INACTIVE feed entry is observed rather than
 * filtered (a received fact about the source), and the detail's `extent`, `employer.orgnr` and `positioncount` become
 * `employmentType`, `taxID` and `totalJobOpenings`.
 *
 * Pure: no Effect services (enforced by `observation/boundary.test.ts`).
 */
export const NAV_IMPORT_METHOD = "nav-import@0";

const stated = (path: string, value: string): Fact<string> =>
  fact("Stated", NAV_IMPORT_METHOD, [path], value);
const absent = (state: "Unknown" | "TempUnknown", why: string): Fact<never> =>
  fact(state, NAV_IMPORT_METHOD, [why]);

/** The first present `[path, value]`, in order: `firstPresent` with provenance. */
const firstOf = (
  candidates: ReadonlyArray<readonly [string, string | null | undefined]>,
): readonly [string, string] | undefined => {
  for (const [path, value] of candidates) {
    const found = presence(value);
    if (found !== undefined) return [path, found];
  }
  return undefined;
};

const textFact = (
  candidates: ReadonlyArray<readonly [string, string | null | undefined]>,
): Fact<string> => {
  const found = firstOf(candidates);
  return found === undefined
    ? absent("Unknown", `absent: ${candidates.map(([path]) => path).join(", ")}`)
    : stated(found[0], found[1]);
};

/** Every non-null JSON leaf as a claim with a stable path. */
export const flattenClaims = (value: unknown, prefix = ""): ReadonlyArray<RawClaim> => {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => flattenClaims(item, `${prefix}[${index}]`));
  }
  if (typeof value === "object" && value !== null) {
    return Object.entries(value).flatMap(([key, item]) =>
      flattenClaims(item, prefix === "" ? key : `${prefix}.${key}`),
    );
  }
  return value === null || value === undefined ? [] : [{ path: prefix, value: String(value) }];
};

const residueOf = (raw: unknown, consumed: ReadonlySet<string>): ReadonlyArray<RawClaim> =>
  flattenClaims(raw)
    .filter((claim) => !consumed.has(claim.path))
    .toSorted((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

/** The paths a set of facts consumed: every evidence entry that is a payload path (no spaces, no `:`). */
const consumedBy = (facts: ListingFacts, envelope: ReadonlyArray<string>): ReadonlySet<string> =>
  new Set([
    ...envelope,
    ...Object.values(facts).flatMap((f: Fact<unknown>) =>
      f.evidence.filter((e) => !/[\s:]/.test(e)),
    ),
  ]);

const decodeFailed = (field: string, detail: string): DecodeFailed =>
  new DecodeFailed({ source: NAV_SOURCE_ID, field, detail });

const issueText = (issue: unknown): string =>
  issue instanceof Error ? issue.message : String(issue);

// ---------------------------------------------------------------------------------------------------- feed

const feedItemObservation = (raw: unknown, item: NavSchema.FeedItem): ObservationContent => {
  const entry = item.feedEntry;
  const facts: ListingFacts = {
    title: textFact([
      ["_feed_entry.title", entry.title],
      ["title", item.title],
    ]),
    hiringOrganization: textFact([["_feed_entry.businessName", entry.businessName]]),
    taxID: absent("TempUnknown", "feed summary carries no orgnr"),
    jobLocation: textFact([["_feed_entry.municipal", entry.municipal]]),
    url: fact(
      "Derived",
      NAV_IMPORT_METHOD,
      ["nav posting url from _feed_entry.uuid"],
      navPostingUrl(entry.uuid),
    ),
    description: textFact([["content_text", item.content_text]]),
    employmentType: absent("TempUnknown", "feed summary carries no extent"),
    totalJobOpenings: absent("TempUnknown", "feed summary carries no positioncount"),
    datePosted: absent("TempUnknown", "feed summary carries no published date"),
    validThrough: absent("TempUnknown", "feed summary carries no expiry"),
  };
  const modified = firstOf([
    ["date_modified", item.date_modified],
    ["_feed_entry.sistEndret", entry.sistEndret],
  ]);
  const envelope = [
    "_feed_entry.uuid",
    "_feed_entry.status",
    ...(modified === undefined ? [] : [modified[0]]),
  ];
  return {
    irVersion: IR_VERSION,
    source: NAV_SOURCE_ID,
    externalId: entry.uuid,
    kind: "FeedEntry",
    status: entry.status.toUpperCase(),
    ...(modified === undefined ? {} : { dateModified: modified[1] }),
    facts,
    residue: residueOf(raw, consumedBy(facts, envelope)),
  };
};

/** One observation per feed item, ACTIVE or not. Fails like `decodeFeedPage` on a payload that is not a feed page. */
export const feedObservations = (
  input: unknown,
): Result.Result<ReadonlyArray<ObservationContent>, DecodeFailed> => {
  const decoded = Schema.decodeUnknownResult(NavSchema.FeedPage)(input);
  if (Result.isFailure(decoded))
    return Result.fail(decodeFailed("feed", issueText(decoded.failure)));
  const rawItems = (input as { readonly items: ReadonlyArray<unknown> }).items;
  return Result.succeed(
    decoded.success.items.map((item, index) => feedItemObservation(rawItems[index], item)),
  );
};

// ---------------------------------------------------------------------------------------------------- detail

const locationFact = (locations: ReadonlyArray<NavSchema.WorkLocation>): Fact<string> => {
  for (const [index, location] of locations.entries()) {
    const parts = (["city", "municipal", "county"] as const).flatMap((key) => {
      const value = presence(location[key]);
      return value === undefined
        ? []
        : [[`ad_content.workLocations[${index}].${key}`, value] as const];
    });
    const values = [...new Set(parts.map(([, value]) => value))];
    if (values.length > 0) {
      return fact(
        "Stated",
        NAV_IMPORT_METHOD,
        parts.map(([path]) => path),
        values.join(", "),
      );
    }
  }
  return absent("Unknown", "absent: ad_content.workLocations");
};

const openingsFact = (raw: string | number | null | undefined): Fact<number> => {
  if (raw === null || raw === undefined || String(raw).trim() === "") {
    return absent("Unknown", "absent: ad_content.positioncount");
  }
  const count = Number(String(raw).trim());
  return Number.isInteger(count) && count >= 1
    ? fact("Stated", NAV_IMPORT_METHOD, ["ad_content.positioncount"], count)
    : absent("Unknown", `ad_content.positioncount=${String(raw)}: not a positive integer`);
};

const detailFacts = (detail: NavSchema.Detail): ListingFacts => {
  const content = detail.ad_content;
  const url = firstOf([
    ["ad_content.applicationUrl", content.applicationUrl],
    ["ad_content.link", content.link],
    ["ad_content.sourceurl", content.sourceurl],
  ]);
  const posted = firstOf([["ad_content.published", content.published]]);
  const updated = firstOf([["ad_content.updated", content.updated]]);
  const description = content.description ? presence(htmlToText(content.description)) : undefined;
  return {
    title: textFact([
      ["ad_content.title", content.title],
      ["ad_content.jobtitle", content.jobtitle],
    ]),
    hiringOrganization: textFact([["ad_content.employer.name", content.employer?.name]]),
    taxID: textFact([["ad_content.employer.orgnr", content.employer?.orgnr]]),
    jobLocation: locationFact(content.workLocations ?? []),
    url:
      url === undefined
        ? fact(
            "Derived",
            NAV_IMPORT_METHOD,
            ["nav posting url from uuid"],
            navPostingUrl(detail.uuid),
          )
        : stated(url[0], url[1]),
    description:
      description === undefined
        ? absent("Unknown", "absent: ad_content.description")
        : fact("Stated", NAV_IMPORT_METHOD, ["ad_content.description"], description),
    employmentType: textFact([["ad_content.extent", content.extent]]),
    totalJobOpenings: openingsFact(content.positioncount),
    datePosted:
      posted !== undefined
        ? stated(posted[0], posted[1])
        : updated !== undefined
          ? fact("Derived", NAV_IMPORT_METHOD, [updated[0]], updated[1])
          : absent("Unknown", "absent: ad_content.published, ad_content.updated"),
    validThrough: textFact([["ad_content.expires", content.expires]]),
  };
};

/** A detail payload as an observation. A closed advert's status-only answer is `closedObservation`. */
export const detailObservation = (
  input: unknown,
): Result.Result<ObservationContent, DecodeFailed> => {
  const decoded = Schema.decodeUnknownResult(NavSchema.Detail)(input);
  if (Result.isFailure(decoded))
    return Result.fail(decodeFailed("ad_content", issueText(decoded.failure)));
  const detail = decoded.success;
  const facts = detailFacts(detail);
  const modified = firstOf([
    ["sistEndret", detail.sistEndret],
    ["ad_content.updated", detail.ad_content.updated],
  ]);
  const envelope = [
    "uuid",
    "status",
    "ad_content.uuid",
    ...(modified === undefined ? [] : [modified[0]]),
  ];
  return Result.succeed({
    irVersion: IR_VERSION,
    source: NAV_SOURCE_ID,
    externalId: detail.uuid,
    kind: "Detail",
    status: detail.status.toUpperCase(),
    ...(modified === undefined ? {} : { dateModified: modified[1] }),
    facts,
    residue: residueOf(input, consumedBy(facts, envelope)),
  });
};

const ClosedAnswer = Schema.Struct({
  uuid: Schema.NonEmptyString,
  status: Schema.NonEmptyString,
  sistEndret: Schema.optional(Schema.NullOr(Schema.String)),
});

const statusOnlyFacts: ListingFacts = {
  title: absent("TempUnknown", "status-only answer"),
  hiringOrganization: absent("TempUnknown", "status-only answer"),
  taxID: absent("TempUnknown", "status-only answer"),
  jobLocation: absent("TempUnknown", "status-only answer"),
  url: absent("TempUnknown", "status-only answer"),
  description: absent("TempUnknown", "status-only answer"),
  employmentType: absent("TempUnknown", "status-only answer"),
  totalJobOpenings: absent("TempUnknown", "status-only answer"),
  datePosted: absent("TempUnknown", "status-only answer"),
  validThrough: absent("TempUnknown", "status-only answer"),
};

/** NAV's answer for a closed advert, `{uuid, sistEndret, status}` (`decode.ts` `isClosedSince`), as an observation. */
export const closedObservation = (
  input: unknown,
): Result.Result<ObservationContent, DecodeFailed> => {
  const decoded = Schema.decodeUnknownResult(ClosedAnswer)(input);
  if (Result.isFailure(decoded))
    return Result.fail(decodeFailed("status", issueText(decoded.failure)));
  const answer = decoded.success;
  const modified = presence(answer.sistEndret);
  return Result.succeed({
    irVersion: IR_VERSION,
    source: NAV_SOURCE_ID,
    externalId: answer.uuid,
    kind: "StatusOnly",
    status: answer.status.toUpperCase(),
    ...(modified === undefined ? {} : { dateModified: modified }),
    facts: statusOnlyFacts,
    residue: residueOf(
      input,
      new Set(["uuid", "status", ...(modified === undefined ? [] : ["sistEndret"])]),
    ),
  });
};

// ---------------------------------------------------------------------------------------------------- lower

const residueValue = (content: ObservationContent, path: string): string | undefined =>
  content.residue.find((claim) => claim.path === path)?.value;

/**
 * IR → `RawListing`, so every existing consumer (identity, `Corpus.observe`, hydration) is unchanged. A feed entry
 * lowers like `summaryListing` (and fails in the same cases: not ACTIVE, no title, no modified time); a detail like
 * `decodeDetail` without a feed summary. A status-only answer has no listing.
 */
export const lower = (content: ObservationContent): Result.Result<RawListing, DecodeFailed> => {
  const f = content.facts;
  const title = f.title.value;
  if (content.kind === "StatusOnly") {
    return Result.fail(
      decodeFailed("status", `${content.externalId}: a status-only answer has no listing`),
    );
  }
  if (content.kind === "FeedEntry") {
    if (content.status !== "ACTIVE") {
      return Result.fail(
        decodeFailed(
          "status",
          `feed entry ${content.externalId} is not active; no summary listing exists for it`,
        ),
      );
    }
    if (title === undefined) {
      return Result.fail(
        decodeFailed("title", `feed entry ${content.externalId} has no usable title`),
      );
    }
    if (content.dateModified === undefined) {
      return Result.fail(
        decodeFailed("modifiedAt", `feed entry ${content.externalId} has no modified timestamp`),
      );
    }
    return Result.succeed({
      sourceId: NAV_SOURCE_ID,
      sourceName: NAV_SOURCE_NAME,
      platformId: NAV_PLATFORM_ID,
      externalId: content.externalId,
      title,
      employerName: f.hiringOrganization.value ?? UNKNOWN_EMPLOYER,
      location: f.jobLocation.value ?? "Norway",
      description: f.description.value ?? NO_DESCRIPTION,
      applicationUrl: navPostingUrl(content.externalId),
      publishedAt: content.dateModified,
      deadline: undefined,
      hydrated: false,
    });
  }
  if (title === undefined) {
    return Result.fail(
      decodeFailed(
        "title",
        `detail ${content.externalId} has no title, jobtitle, or feed fallback`,
      ),
    );
  }
  const publishedAt = f.datePosted.value;
  if (publishedAt === undefined) {
    return Result.fail(
      decodeFailed(
        "published",
        `detail ${content.externalId} has no published, updated, or feed fallback timestamp`,
      ),
    );
  }
  const due = isoDatePrefix(residueValue(content, "ad_content.applicationDue"));
  return Result.succeed({
    sourceId: NAV_SOURCE_ID,
    sourceName: NAV_SOURCE_NAME,
    platformId: NAV_PLATFORM_ID,
    externalId: content.externalId,
    title,
    employerName: f.hiringOrganization.value ?? UNKNOWN_EMPLOYER,
    location: f.jobLocation.value ?? "Norway",
    description: f.description.value ?? NO_DESCRIPTION,
    applicationUrl: f.url.value ?? navPostingUrl(content.externalId),
    publishedAt,
    deadline: due ?? isoDatePrefix(f.validThrough.value),
    hydrated: true,
  });
};
