import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import type { JobSnapshot } from "@job-index/domain/Job";
import type { Experience, Profile } from "@job-index/domain/Profile";
import { composeLetter } from "./composeLetter.ts";
import { testJob, testProfile } from "./fixtures.ts";

// Fixed-width, disjoint token vocabularies for the property test below: see
// the "never claims a skill" test for why they are shaped this way.
const skillToken = (index: number): string => `skl-${String(index).padStart(2, "0")}`;
const noiseToken = (index: number): string => `nse-${String(index).padStart(2, "0")}`;

describe("composeLetter", () => {
  it("opens with the role and the employer", () => {
    const job = testJob({
      title: "Customer Service Adviser",
      employerName: "Oslo Service Group AS",
    });
    const letter = composeLetter(testProfile(), job);
    expect(
      letter.startsWith("I am applying for Customer Service Adviser at Oslo Service Group AS."),
    ).toBe(true);
  });

  it("cites the strongest relevant experience", () => {
    const job = testJob({
      title: "Customer Service Adviser",
      description: "Answer customer questions through chat and telephone support.",
    });
    const support: Experience = {
      title: "Customer Service Adviser",
      employer: "Nordic Retail AS",
      period: "2022-2026",
      highlights: ["Handled chat and telephone support"],
    };
    const barista: Experience = {
      title: "Barista",
      employer: "Kaffebrenneriet",
      period: "2019-2022",
      highlights: ["Trained new staff"],
    };
    const letter = composeLetter(testProfile({ experience: [barista, support] }), job);
    expect(letter).toContain("Customer Service Adviser at Nordic Retail AS");
    expect(letter).toContain("Handled chat and telephone support");
  });

  /**
   * The regression the previous implementation pinned with one example. Kept
   * here in its original, readable shape; the law it is an instance of is
   * proven for arbitrary profiles and adverts below.
   */
  it("names a matched skill but never one the advert does not mention", () => {
    const job = testJob({
      title: "Customer Service Adviser",
      description: "Answer customer questions through chat and telephone support.",
    });
    const profile = testProfile({
      headline: "Customer support specialist",
      skills: ["support", "underwater welding"],
      experience: [
        {
          title: "Customer Service Adviser",
          employer: "Nordic Retail AS",
          period: "2022-2026",
          highlights: ["Handled chat and telephone support"],
        },
      ],
    });

    const letter = composeLetter(profile, job);

    expect(letter).toContain("support");
    expect(letter).not.toContain("underwater welding");
  });

  it("names only overlap the advert actually has when there is none", () => {
    const job = testJob({
      title: "Baker",
      description: "Bakes bread all day.",
      employerName: "Bakery AS",
    });
    const letter = composeLetter(testProfile({ skills: ["underwater welding"] }), job);
    expect(letter).not.toContain("underwater welding");
    expect(letter).not.toContain("The advert asks for");
  });

  /**
   * The law the previous implementation's single example was standing in
   * for: no profile skill the advert does not mention can ever reach the
   * letter, for *any* profile and *any* advert — not just the one somebody
   * thought to write down.
   *
   * Skills and "noise" text are drawn from two fixed-width, disjoint token
   * vocabularies (`skl-NN` / `nse-NN`) rather than free-form strings. That is
   * not a simplification of the property — it is what makes the assertion
   * sound: a skill can only appear in the advert or the letter by literally
   * being one of the tokens placed there, so there is no way for the
   * generator itself to produce a false failure (or a false pass) through an
   * accidental substring collision between an unrelated skill and unrelated
   * prose.
   */
  it("never claims a skill the advert does not mention", () => {
    const arbWords = (maxLength: number): fc.Arbitrary<string> =>
      fc
        .array(fc.integer({ min: 0, max: 29 }).map(noiseToken), { maxLength })
        .map((words) => words.join(" "));

    const arbExperience: fc.Arbitrary<Experience> = fc.record({
      title: arbWords(3),
      employer: arbWords(2),
      period: fc.constantFrom("2018-2020", "2020-2024", "2024-2026"),
      highlights: fc.array(arbWords(4), { maxLength: 3 }),
    });

    const arbScenario = fc
      .uniqueArray(fc.integer({ min: 0, max: 29 }), { maxLength: 10 })
      .chain((skillIndices) =>
        fc.record({
          profile: fc.record({
            headline: arbWords(3),
            summary: fc.constant(""),
            location: fc.constant(""),
            languages: fc.constant(""),
            skills: fc.constant(skillIndices.map(skillToken)),
            experience: fc.array(arbExperience, { maxLength: 3 }),
            education: fc.constant([] as ReadonlyArray<string>),
          }),
          job: fc.record({
            title: arbWords(3),
            employerName: arbWords(2),
            location: arbWords(1),
            description: fc
              .subarray(skillIndices)
              .chain((advertised) =>
                arbWords(6).map((noise) => [...advertised.map(skillToken), noise].join(" ")),
              ),
          }),
        }),
      );

    fc.assert(
      fc.property(arbScenario, ({ profile, job }) => {
        const fullJob = testJob(job as Partial<JobSnapshot>);
        const letter = composeLetter(profile as Profile, fullJob);
        const advert =
          `${fullJob.title} ${fullJob.description} ${fullJob.employerName}`.toLowerCase();

        for (const skill of profile.skills) {
          if (!advert.includes(skill.toLowerCase())) {
            expect(letter).not.toContain(skill);
          }
        }
      }),
    );
  });
});
