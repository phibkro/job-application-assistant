import { describe, expect, it } from "vitest";
import type { CanonicalJob } from "./Job.ts";
import type { Profile } from "./Profile.ts";
import { assess, isExcluded, rankMatchedJobs, type MatchedJob } from "./Match.ts";

const profile: Profile = {
  headline: "Frontend engineer",
  summary: "",
  location: "Oslo",
  languages: "",
  skills: ["TypeScript", "React", "TypeScript"],
  experience: [],
  education: [],
  preferences: {
    desiredRoles: ["Frontend"],
    desiredLocations: ["Oslo"],
    excludedTerms: ["agency"],
  },
};

const job = (overrides: Partial<CanonicalJob> = {}): CanonicalJob => ({
  id: "job-1" as never,
  title: "Frontendutvikler",
  employerName: "Nordic Tech",
  location: "Oslo",
  applicationUrl: "https://example.invalid/job-1",
  publishedAt: "2026-01-01T00:00:00Z",
  status: { _tag: "Active" },
  sequence: 1 as never,
  changedAt: "2026-01-01T00:00:00Z",
  sources: [],
  hydration: { _tag: "Hydrated", description: "Build React applications with TypeScript." },
  ...overrides,
});

describe("assess", () => {
  it("folds case and diacritics and carries role, location, and skill evidence", () => {
    const result = assess(
      { ...profile, preferences: { ...profile.preferences!, desiredLocations: ["Øslo"] } },
      job({ location: "OSLO" }),
    );
    expect(result).toEqual({
      fit: "strong",
      score: 7,
      reasons: [
        { kind: "role", profileValue: "Frontend", jobField: "title", jobValue: "Frontendutvikler" },
        { kind: "location", profileValue: "Øslo", jobField: "location", jobValue: "OSLO" },
        {
          kind: "skill",
          profileValue: "TypeScript",
          jobField: "description",
          jobValue: "Build React applications with TypeScript.",
        },
        {
          kind: "skill",
          profileValue: "React",
          jobField: "description",
          jobValue: "Build React applications with TypeScript.",
        },
      ],
      concerns: [],
    });
  });

  it("reports requested dimensions that did not match and omits empty dimensions", () => {
    const result = assess(
      {
        ...profile,
        preferences: {
          ...profile.preferences!,
          desiredRoles: ["Baker"],
          desiredLocations: ["Bergen"],
        },
      },
      job({ title: "Support engineer", location: "Oslo", hydration: { _tag: "Unhydrated" } }),
    );
    expect(result?.fit).toBe("weak");
    expect(result?.score).toBe(0);
    expect(result?.reasons).toEqual([]);
    expect(result?.concerns).toEqual([
      "No desired role matched the job title",
      "No desired location matched the job location",
    ]);
  });

  it("excludes terms from visible fields and never assesses closed jobs", () => {
    expect(isExcluded(profile, job({ employerName: "A GENCY" }))).toBe(true);
    expect(assess(profile, job({ employerName: "A GENCY" }))).toBeUndefined();
    expect(
      assess(profile, job({ status: { _tag: "Closed", closedAt: "2026-02-01T00:00:00Z" } })),
    ).toBeUndefined();
  });
});

describe("rankMatchedJobs", () => {
  it("orders score descending, then sequence descending, then id ascending", () => {
    const make = (id: string, score: number, sequence: number): MatchedJob => ({
      job: job({ id: id as never, sequence: sequence as never }),
      assessment: {
        fit: score >= 6 ? "strong" : score >= 3 ? "possible" : "weak",
        score,
        reasons: [],
        concerns: [],
      },
    });
    expect(
      rankMatchedJobs([make("b", 3, 2), make("c", 3, 2), make("a", 6, 1)]).map(
        (item) => item.job.id,
      ),
    ).toEqual(["a", "b", "c"]);
  });
});
