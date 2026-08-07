import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import * as Effect from "effect/Effect";
import type { SourceId } from "../../../domain/src/Ids.ts";
import {
  hasJobPostingType,
  identifierFromValue,
  locationFromJobLocation,
  type JobPostingContext,
  toRawListing,
} from "./JobPosting.ts";

const context: JobPostingContext = {
  sourceId: "career-site" as SourceId,
  sourceName: "Career Site",
  pageUrl: "https://careers.example/openings/backend-engineer",
};

describe("hasJobPostingType", () => {
  it("accepts a bare string @type", () => {
    expect(hasJobPostingType({ "@type": "JobPosting" })).toBe(true);
  });

  it("accepts JobPosting anywhere in a multi-typed array", () => {
    expect(hasJobPostingType({ "@type": ["Thing", "JobPosting"] })).toBe(true);
  });

  it("rejects unrelated node types and malformed nodes", () => {
    expect(hasJobPostingType({ "@type": "Organization" })).toBe(false);
    expect(hasJobPostingType({})).toBe(false);
    expect(hasJobPostingType(null)).toBe(false);
    expect(hasJobPostingType("JobPosting")).toBe(false);
  });
});

describe("identifierFromValue", () => {
  it("reads a bare string or a PropertyValue.value identically", () => {
    expect(identifierFromValue("job-100")).toBe("job-100");
    expect(identifierFromValue({ "@type": "PropertyValue", value: "job-100" })).toBe("job-100");
  });

  /** The two shapes schema.org allows for `identifier` must never disagree
   * for the same underlying id — that is the whole point of them being
   * treated as equivalent. */
  it("the two shapes are equivalent for any id text", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (id) => {
        expect(identifierFromValue(id)).toBe(identifierFromValue({ value: id }));
      }),
    );
  });
});

describe("locationFromJobLocation", () => {
  it("reads the first Place in an array of locations", () => {
    const value = [
      { address: { addressLocality: "Oslo" } },
      { address: { addressLocality: "Bergen" } },
    ];
    expect(locationFromJobLocation(value)).toBe("Oslo");
  });

  it("tolerates an address inlined directly under jobLocation, no Place wrapper", () => {
    expect(locationFromJobLocation({ addressLocality: "Trondheim", addressCountry: "NO" })).toBe(
      "Trondheim, NO",
    );
  });

  it("returns undefined for a location with nothing usable", () => {
    expect(locationFromJobLocation({})).toBeUndefined();
    expect(locationFromJobLocation(undefined)).toBeUndefined();
  });
});

describe("toRawListing", () => {
  it("builds a usable listing from a fully-populated posting", async () => {
    const posting = {
      "@type": "JobPosting",
      title: "Backend Engineer",
      description: "<p>Build things &amp; ship them.</p>",
      identifier: { "@type": "PropertyValue", value: "job-100" },
      datePosted: "2026-08-01",
      validThrough: "2026-09-01T23:59:59Z",
      url: "/openings/backend-engineer",
      hiringOrganization: { "@type": "Organization", name: "Example AS" },
      jobLocation: { address: { addressLocality: "Oslo", addressCountry: "NO" } },
    };

    const listing = await Effect.runPromise(toRawListing(posting, context));

    expect(listing.title).toBe("Backend Engineer");
    expect(listing.description).toBe("Build things & ship them.");
    expect(listing.externalId).toBe("job-100");
    expect(listing.employerName).toBe("Example AS");
    expect(listing.location).toBe("Oslo, NO");
    expect(listing.deadline).toBe("2026-09-01");
    expect(listing.applicationUrl).toBe("https://careers.example/openings/backend-engineer");
  });

  it("refuses a posting with neither title nor name", async () => {
    const posting = { "@type": "JobPosting", datePosted: "2026-08-01" };
    const exit = await Effect.runPromiseExit(toRawListing(posting, context));
    expect(exit._tag).toBe("Failure");
  });

  it("refuses a posting with no datePosted rather than inventing a timestamp", async () => {
    const posting = { "@type": "JobPosting", title: "Backend Engineer" };
    const exit = await Effect.runPromiseExit(toRawListing(posting, context));
    expect(exit._tag).toBe("Failure");
  });

  it("falls back to the page URL when the posting has none", async () => {
    const posting = { "@type": "JobPosting", title: "Backend Engineer", datePosted: "2026-08-01" };
    const listing = await Effect.runPromise(toRawListing(posting, context));
    expect(listing.applicationUrl).toBe(context.pageUrl);
  });
});
