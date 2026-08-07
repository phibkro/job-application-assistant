import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import type { RawListing } from "@job-index/domain/Job";
import type { SourceId } from "@job-index/domain/Ids";
import { canonicalizeUrl, deriveCanonicalKey, normalize } from "./identity.ts";

/** A `RawListing` field arbitrary that avoids the empty string, so title/employer/location dedup keys stay meaningfully distinguishable. */
const nonEmptyText = fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim() !== "");

const rawListingArb: fc.Arbitrary<RawListing> = fc.record({
  sourceId: fc.constantFrom("nav", "webcruiter", "finn").map((s) => s as SourceId),
  sourceName: nonEmptyText,
  externalId: nonEmptyText,
  title: nonEmptyText,
  employerName: nonEmptyText,
  location: nonEmptyText,
  description: fc.string(),
  applicationUrl: fc.webUrl(),
  publishedAt: fc.constant("2026-01-01T00:00:00Z"),
  deadline: fc.option(fc.string(), { nil: undefined }),
});

const TRACKING_PARAMS = [
  "utm_source=newsletter",
  "utm_campaign=spring",
  "gclid=abc123",
  "fbclid=xyz",
];

describe("canonicalizeUrl", () => {
  it("strips tracking parameters and sorts the rest", () => {
    expect(canonicalizeUrl("https://EXAMPLE.com/job/1/?utm_source=x&b=2&a=1")).toBe(
      "https://example.com/job/1?a=1&b=2",
    );
  });

  it("is total: unparseable input never throws", () => {
    fc.assert(
      fc.property(fc.string(), (garbage) => {
        expect(() => canonicalizeUrl(garbage)).not.toThrow();
      }),
    );
  });

  it("is idempotent", () => {
    fc.assert(
      fc.property(fc.webUrl(), (url) => {
        const once = canonicalizeUrl(url);
        expect(canonicalizeUrl(once)).toBe(once);
      }),
    );
  });

  /** The property the deduplication rule leans on: a source rotating tracking parameters must not change identity. */
  it("different tracking parameters on the same URL canonicalise the same", () => {
    fc.assert(
      fc.property(
        fc.webUrl(),
        fc.subarray(TRACKING_PARAMS, { minLength: 0, maxLength: TRACKING_PARAMS.length }),
        fc.subarray(TRACKING_PARAMS, { minLength: 0, maxLength: TRACKING_PARAMS.length }),
        (base, extraA, extraB) => {
          const sep = base.includes("?") ? "&" : "?";
          const urlA = extraA.length === 0 ? base : `${base}${sep}${extraA.join("&")}`;
          const urlB = extraB.length === 0 ? base : `${base}${sep}${extraB.join("&")}`;
          expect(canonicalizeUrl(urlA)).toBe(canonicalizeUrl(urlB));
        },
      ),
    );
  });
});

describe("normalize", () => {
  it("is deterministic: the same RawListing always derives the same ids", () => {
    fc.assert(
      fc.property(rawListingArb, (raw) => {
        const a = normalize(raw);
        const b = normalize(raw);
        expect(a.occurrenceId).toBe(b.occurrenceId);
        expect(a.canonicalJobId).toBe(b.canonicalJobId);
        expect(a.canonicalKey).toBe(b.canonicalKey);
        expect(a.contentFingerprint).toBe(b.contentFingerprint);
      }),
    );
  });

  it("different tracking parameters on the same applicationUrl derive the same canonical id and fingerprint", () => {
    fc.assert(
      fc.property(
        rawListingArb,
        fc.subarray(TRACKING_PARAMS, { minLength: 1, maxLength: TRACKING_PARAMS.length }),
        (raw, extra) => {
          const sep = raw.applicationUrl.includes("?") ? "&" : "?";
          const withTracking: RawListing = {
            ...raw,
            applicationUrl: `${raw.applicationUrl}${sep}${extra.join("&")}`,
          };
          const plain = normalize(raw);
          const tracked = normalize(withTracking);
          expect(tracked.canonicalJobId).toBe(plain.canonicalJobId);
          expect(tracked.occurrenceId).toBe(plain.occurrenceId);
          expect(tracked.contentFingerprint).toBe(plain.contentFingerprint);
        },
      ),
    );
  });

  it("genuinely different vacancies derive different canonical ids", () => {
    fc.assert(
      fc.property(rawListingArb, rawListingArb, (rawA, rawB) => {
        fc.pre(deriveCanonicalKey(rawA) !== deriveCanonicalKey(rawB));
        expect(normalize(rawA).canonicalJobId).not.toBe(normalize(rawB).canonicalJobId);
      }),
    );
  });

  it("different sources for the same vacancy derive the same canonical id but different occurrence ids", () => {
    fc.assert(
      fc.property(rawListingArb, (raw) => {
        const other: RawListing = {
          ...raw,
          sourceId: (raw.sourceId === "nav" ? "webcruiter" : "nav") as SourceId,
          externalId: `${raw.externalId}-other`,
        };
        const a = normalize(raw);
        const b = normalize(other);
        expect(a.canonicalJobId).toBe(b.canonicalJobId);
        expect(a.occurrenceId).not.toBe(b.occurrenceId);
      }),
    );
  });

  it("the same source occurrence re-observed with different content still derives the same occurrenceId", () => {
    fc.assert(
      fc.property(rawListingArb, nonEmptyText, (raw, newDescription) => {
        const updated: RawListing = { ...raw, description: newDescription };
        expect(normalize(raw).occurrenceId).toBe(normalize(updated).occurrenceId);
      }),
    );
  });
});
