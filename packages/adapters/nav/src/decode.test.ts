import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import * as fc from "fast-check";
import { decodeDetail, decodeFeedPage, NAV_SOURCE_ID, summaryListing } from "./decode.ts";

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`../../../../fixtures/nav/${name}`, import.meta.url), "utf8"));

describe("decodeFeedPage", () => {
  it("preserves vacancy identity and activity from the recorded feed page", async () => {
    const page = await Effect.runPromise(decodeFeedPage(fixture("feed-page.json")));

    expect(page.items).toHaveLength(2);
    expect(page.items[0]?.externalId).toBe("active-vacancy-1");
    expect(page.items[0]?.active).toBe(true);
    expect(page.items[1]?.externalId).toBe("inactive-vacancy-2");
    expect(page.items[1]?.active).toBe(false);
    expect(page.nextUrl).toBe("/api/v1/feed/page-2");
  });
});

describe("summaryListing", () => {
  it("builds a listing straight from feed data for an active entry", async () => {
    const page = await Effect.runPromise(decodeFeedPage(fixture("feed-page.json")));
    const listing = await Effect.runPromise(summaryListing(page.items[0]!));

    expect(listing.sourceId).toBe(NAV_SOURCE_ID);
    expect(listing.externalId).toBe("active-vacancy-1");
    expect(listing.title).toBe("Technical Support Specialist");
    expect(listing.applicationUrl).toBe(
      "https://arbeidsplassen.nav.no/stillinger/stilling/active-vacancy-1",
    );
    expect(listing.deadline).toBeUndefined();
  });

  it("refuses an inactive entry rather than inventing a listing for it", async () => {
    const page = await Effect.runPromise(decodeFeedPage(fixture("feed-page.json")));
    const result = await Effect.runPromiseExit(summaryListing(page.items[1]!));

    expect(result._tag).toBe("Failure");
  });
});

describe("decodeDetail", () => {
  it("maps a crafted active detail to a raw listing", async () => {
    const listing = await Effect.runPromise(decodeDetail(fixture("detail-active.json")));

    expect(listing.externalId).toBe("active-vacancy-1");
    expect(listing.title).toBe("Technical Support Specialist");
    expect(listing.employerName).toBe("Example Technology AS");
    expect(listing.location).toBe("Oslo");
    expect(listing.deadline).toBe("2026-08-25");
    // The advert body arrives as HTML and must reach RawListing as text.
    expect(listing.description).toBe("Help customers use technical products.");
    expect(listing.applicationUrl).toBe("https://careers.example/jobs/100?utm_source=nav");
  });

  it("decodes detail-updated and detail-nonmatching structurally (both are ACTIVE, same envelope shape)", async () => {
    const listings = await Promise.all(
      ["detail-updated.json", "detail-nonmatching.json"].map((name) =>
        Effect.runPromise(decodeDetail(fixture(name))),
      ),
    );
    for (const listing of listings) {
      expect(listing.title.length).toBeGreaterThan(0);
      expect(listing.employerName).toBe("Example Technology AS");
      expect(listing.deadline).toBe("2026-08-25");
    }
  });

  /**
   * The crafted fixtures assert journey behaviour, which needs controlled
   * content. This one asserts the decoder still fits what NAV actually
   * serves — the failure the crafted fixtures could not see: every live
   * detail fetch fell back to summary data while they stayed green.
   *
   * Assertions deliberately avoid the advert's wording, which changes with
   * each capture, and check only that real content arrived at all.
   */
  it("fits the recorded live payload (ground truth — re-run scripts/capture-nav-fixture.sh if this fails)", async () => {
    const listing = await Effect.runPromise(decodeDetail(fixture("live-detail.json")));

    expect(listing.title.trim().length).toBeGreaterThan(0);
    expect(listing.employerName.trim().length).toBeGreaterThan(0);
    expect(listing.employerName).not.toBe("Unknown employer");
    expect(listing.description.length).toBeGreaterThan(40);
    expect(listing.description).not.toBe("See source listing for details.");
    expect(listing.description).not.toContain("<");
    // applicationUrl is empty in this capture; the advert's own `link` is the
    // fallback, and only "some absolute URL exists" holds across captures.
    expect(listing.applicationUrl.startsWith("https://")).toBe(true);
    expect(listing.publishedAt.startsWith("20")).toBe(true);
    // applicationDue is "Snarest" (free text) in this capture, so the
    // deadline must come from the advert's expiry instead.
    expect(listing.deadline).toBe("2026-10-31");
  });

  it("rejects a payload that is only the advert, with no envelope, instead of silently degrading", async () => {
    const innerOnly = { description: "Body", jobtitle: "Title" };
    const result = await Effect.runPromiseExit(decodeDetail(innerOnly));

    expect(result._tag).toBe("Failure");
  });

  it("does not turn free text into a date, and prefers the advert's expiry", async () => {
    const payload = {
      uuid: "active-vacancy-1",
      status: "ACTIVE",
      sistEndret: "2026-08-05T08:00:00Z",
      ad_content: {
        published: "2026-08-05T07:45:00Z",
        expires: "2026-08-26T00:00:00+02:00",
        title: "Technical Support Specialist",
        description: "<p>Body &amp; more</p>",
        applicationUrl: "https://careers.example/jobs/100",
        applicationDue: "Snarest",
        employer: { name: "Example Technology AS" },
      },
    };

    const listing = await Effect.runPromise(decodeDetail(payload));

    expect(listing.deadline).toBe("2026-08-26");
    expect(listing.description).toBe("Body & more");
  });

  /**
   * The property the live payload exists to prove: an explicit JSON `null`
   * and an absent key must decode to the same listing. A crafted example
   * pins one case; this holds it for every value the rest of the record
   * could take.
   */
  it("decodes an absent workLocation field identically to an explicit null", () => {
    const arbLocationPart = fc.option(fc.string({ minLength: 1, maxLength: 12 }), {
      nil: undefined,
    });

    fc.assert(
      fc.property(arbLocationPart, arbLocationPart, arbLocationPart, (city, municipal, county) => {
        const withNulls = {
          uuid: "vacancy-x",
          status: "ACTIVE",
          ad_content: {
            published: "2026-08-05T07:45:00Z",
            title: "Title",
            description: "Body",
            employer: { name: "Employer" },
            workLocations: [
              {
                city: city ?? null,
                address: null,
                postalCode: null,
                municipal: municipal ?? null,
                county: county ?? null,
              },
            ],
          },
        };
        const withAbsentKeys = {
          uuid: "vacancy-x",
          status: "ACTIVE",
          ad_content: {
            published: "2026-08-05T07:45:00Z",
            title: "Title",
            description: "Body",
            employer: { name: "Employer" },
            workLocations: [
              {
                ...(city === undefined ? {} : { city }),
                ...(municipal === undefined ? {} : { municipal }),
                ...(county === undefined ? {} : { county }),
              },
            ],
          },
        };

        const nullResult = Effect.runSync(decodeDetail(withNulls));
        const absentResult = Effect.runSync(decodeDetail(withAbsentKeys));
        expect(nullResult.location).toBe(absentResult.location);
      }),
    );
  });
});
