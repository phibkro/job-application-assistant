import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import { fromJson, toJson, toMarkdown } from "./Profile.ts";
import type { Experience, Profile } from "./Profile.ts";

const blank: Profile = {
  headline: "",
  summary: "",
  location: "",
  languages: "",
  skills: [],
  experience: [],
  education: [],
};

const experienceArb: fc.Arbitrary<Experience> = fc.record({
  title: fc.string(),
  employer: fc.string(),
  period: fc.string(),
  highlights: fc.array(fc.string()),
});

const profileArb: fc.Arbitrary<Profile> = fc.record({
  headline: fc.string(),
  summary: fc.string(),
  location: fc.string(),
  languages: fc.string(),
  skills: fc.array(fc.string()),
  experience: fc.array(experienceArb),
  education: fc.array(fc.string()),
});

describe("toJson / fromJson", () => {
  /**
   * "The export you can re-import" is a law, not an example: it must hold for
   * every profile, including the empty strings and empty arrays a real
   * profile starts as.
   */
  it("round-trips a profile exactly", () => {
    fc.assert(
      fc.property(profileArb, (profile) => {
        expect(fromJson(toJson(profile))).toEqual(profile);
      }),
    );
  });

  it("rejects a key the schema does not recognise, naming it", () => {
    expect(() => fromJson(JSON.stringify({ ...blank, hobby: "chess" }))).toThrow(/hobby/);
  });

  it("rejects a profile missing a required field, naming it", () => {
    const { headline: _headline, ...rest } = blank;
    expect(() => fromJson(JSON.stringify(rest))).toThrow(/headline/);
  });

  it("rejects invalid JSON syntax", () => {
    expect(() => fromJson("{not json")).toThrow();
  });
});

describe("toMarkdown", () => {
  it("renders nothing for a wholly empty profile", () => {
    expect(toMarkdown(blank)).toBe("");
  });

  /** The case that produces stray headings and dangling bullets if nobody checked. */
  it("omits sections the profile has nothing for", () => {
    const md = toMarkdown({ ...blank, headline: "Baker", summary: "Bread since 2019." });
    expect(md).toContain("# Baker");
    expect(md).toContain("## Summary");
    expect(md).toContain("Bread since 2019.");
    expect(md).not.toContain("## Experience");
    expect(md).not.toContain("## Skills");
    expect(md).not.toContain("## Education");
    expect(md).not.toContain("## Languages");
    expect(md).not.toMatch(/^-\s/m);
  });

  it("renders every section a full profile has", () => {
    const profile: Profile = {
      headline: "Customer support specialist",
      summary: "Ten years in customer-facing roles.",
      location: "Oslo",
      languages: "Norwegian, English",
      skills: ["support", "typescript"],
      experience: [
        {
          title: "Customer Service Adviser",
          employer: "Nordic Retail AS",
          period: "2022-2026",
          highlights: ["Handled chat and telephone support"],
        },
      ],
      education: ["BA, Oslo Metropolitan University"],
    };
    const md = toMarkdown(profile);
    expect(md).toContain("# Customer support specialist");
    expect(md).toContain("Oslo");
    expect(md).toContain("## Experience");
    expect(md).toContain("### Customer Service Adviser — Nordic Retail AS (2022-2026)");
    expect(md).toContain("- Handled chat and telephone support");
    expect(md).toContain("## Skills");
    expect(md).toContain("support, typescript");
    expect(md).toContain("## Education");
    expect(md).toContain("- BA, Oslo Metropolitan University");
    expect(md).toContain("## Languages");
    expect(md).toContain("Norwegian, English");
  });
});
