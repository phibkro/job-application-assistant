import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import type { Experience } from "@job-index/domain/Profile";
import { advertText, rankExperience, relevance } from "./relevance.ts";
import { testJob } from "./fixtures.ts";

const experience = (fields: Partial<Experience>): Experience => ({
  title: "",
  employer: "",
  period: "",
  highlights: [],
  ...fields,
});

// Compares two `Experience` values as a total order over their JSON
// representation, without relying on the default array-sort comparator
// (which coerces via `toString` — unsafe for fast-check's generated
// records, some of which are not plain `Object.prototype` instances).
const byJson = (a: Experience, b: Experience): number =>
  JSON.stringify(a).localeCompare(JSON.stringify(b));

describe("advertText", () => {
  it("joins the fields a draft is matched against", () => {
    const job = testJob({ title: "Baker", description: "Bakes bread.", employerName: "Bakery AS" });
    expect(advertText(job)).toBe("Baker Bakes bread. Bakery AS");
  });
});

describe("relevance", () => {
  /** Mirrors the guarantee the previous implementation pinned with an example. */
  it("ranks matching experience above unrelated experience", () => {
    const advert = "Support Engineer needed for chat and telephone support.";
    const support = experience({
      title: "Customer Service Adviser",
      highlights: ["Handled chat and telephone support"],
    });
    const barista = experience({ title: "Barista", highlights: ["Trained new staff"] });

    expect(relevance(support, advert)).toBeGreaterThan(relevance(barista, advert));
  });

  it("is never negative", () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), fc.array(fc.string()), (title, advert, highlights) => {
        expect(relevance(experience({ title, highlights }), advert)).toBeGreaterThanOrEqual(0);
      }),
    );
  });

  it("ignores case", () => {
    fc.assert(
      fc.property(fc.string(), (word) => {
        const token = `${word}word`; // length > 3 so it is eligible to score
        const entry = experience({ title: token });
        expect(relevance(entry, token.toUpperCase())).toBe(relevance(entry, token.toLowerCase()));
      }),
    );
  });

  it("is a function of its inputs only", () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), fc.array(fc.string()), (title, advert, highlights) => {
        const entry = experience({ title, highlights });
        expect(relevance(entry, advert)).toBe(relevance(entry, advert));
      }),
    );
  });
});

describe("rankExperience", () => {
  it("orders every adjacent pair by non-increasing relevance", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            title: fc.string(),
            employer: fc.constant(""),
            period: fc.constant(""),
            highlights: fc.array(fc.string(), { maxLength: 3 }),
          }),
          { maxLength: 8 },
        ),
        fc.string(),
        (entries, advert) => {
          const ranked = rankExperience(entries, advert);
          for (let index = 0; index + 1 < ranked.length; index++) {
            expect(relevance(ranked[index], advert)).toBeGreaterThanOrEqual(
              relevance(ranked[index + 1], advert),
            );
          }
        },
      ),
    );
  });

  it("keeps the profile's own order between equally-scored entries", () => {
    const first = experience({ title: "First" });
    const second = experience({ title: "Second" });
    // Neither entry shares a token with the advert, so both score zero.
    expect(rankExperience([first, second], "unrelated advert text")).toEqual([first, second]);
  });

  it("is a permutation of its input", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            title: fc.string(),
            employer: fc.constant(""),
            period: fc.constant(""),
            highlights: fc.constant([] as ReadonlyArray<string>),
          }),
          { maxLength: 8 },
        ),
        fc.string(),
        (entries, advert) => {
          const ranked = rankExperience(entries, advert);
          expect(ranked).toHaveLength(entries.length);
          // Compare as multisets, order-independent.
          expect(ranked.toSorted(byJson)).toEqual(entries.toSorted(byJson));
        },
      ),
    );
  });
});
