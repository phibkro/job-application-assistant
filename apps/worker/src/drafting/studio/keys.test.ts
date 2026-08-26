import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import { Answer } from "@job-index/domain/Answer";
import * as DateTime from "effect/DateTime";
import type { JobSnapshot } from "@job-index/domain/Job";
import type { Profile } from "@job-index/domain/Profile";
import { finalize, keyFacts, renderInventory, type KeyedFact } from "./keys.ts";

const profile: Profile = {
  headline: "Support engineer",
  summary: "Five years in customer support.",
  location: "Oslo",
  languages: "Norwegian, English",
  skills: ["Zendesk", "SQL", "Norwegian"],
  experience: [
    {
      title: "Support engineer",
      employer: "Acme",
      period: "2021-2026",
      highlights: ["Cut backlog by 40%", "Wrote the on-call handbook"],
    },
    { title: "Agent", employer: "Beta", period: "2019-2021", highlights: [] },
  ],
  education: ["Oslo Met"],
  preferences: {
    desiredRoles: ["support engineer"],
    desiredLocations: ["Oslo", "remote"],
    excludedTerms: ["gambling"],
  },
};

const now = DateTime.nowUnsafe();

const makeAnswer = (question: string, label: string, value: string): Answer =>
  new Answer({
    profileId: "profile-1" as Answer["profileId"],
    question: question as Answer["question"],
    label,
    shape: { _tag: "Text" },
    value,
    origin: "stated" as const,
    createdAt: now,
    updatedAt: now,
  });

function answer(question: string, label: string, value: string): Answer {
  return makeAnswer(question, label, value);
}

const answers: ReadonlyArray<Answer> = [
  answer("notice-period", "Notice period", "One month"),
  answer("years-experience", "Years of experience", "5"),
];

const snapshot: JobSnapshot = {
  title: "Baker",
  employerName: "Bakery AS",
  location: "Oslo",
  description: "Bakes bread.",
  applicationUrl: "https://jobs.example.invalid/1",
  publishedAt: "2026-01-01T00:00:00Z",
};

const factsFor = (job?: JobSnapshot): ReadonlyArray<KeyedFact> => keyFacts(profile, answers, job);

describe("keyFacts", () => {
  it("keys every populated scalar and array item of the profile", () => {
    const keys = factsFor().map((fact) => fact.key);
    for (const expected of [
      "profile.headline",
      "profile.summary",
      "profile.location",
      "profile.languages",
      "profile.skills.0",
      "profile.skills.2",
      "profile.education.0",
      "profile.preferences.desiredRoles.0",
      "profile.preferences.desiredLocations.1",
      "profile.preferences.excludedTerms.0",
      "profile.experience.0.title",
      "profile.experience.0.employer",
      "profile.experience.0.period",
      "profile.experience.0.highlights.0",
      "profile.experience.0.highlights.1",
      "profile.experience.1.title",
      "answer.notice-period",
      "answer.years-experience",
    ]) {
      expect(keys).toContain(expected);
    }
  });

  it("omits empty values so the model cannot reference absent facts", () => {
    const sparse = keyFacts({ ...profile, headline: "", skills: [] }, [], undefined);
    const keys = sparse.map((fact) => fact.key);
    expect(keys).not.toContain("profile.headline");
    expect(keys).not.toContain("profile.skills.0");
  });

  it("includes vacancy keys only for targeted documents", () => {
    expect(factsFor(snapshot).map((f) => f.key)).toContain("job.title");
    expect(factsFor(undefined).map((f) => f.key)).not.toContain("job.title");
  });

  it("excludes every question key outside the exact single-segment grammar", () => {
    const unsafeKeys = ["", "a.b", "a..b", ".leading", "a/b", "a{b}", "a b", "a\tb", "fødselsdato"];
    const unsafe = [...unsafeKeys.map((key) => answer(key, key, `secret-${key}`)), ...answers];
    const facts = keyFacts(profile, unsafe, undefined);
    const keys = facts.map((fact) => fact.key);
    for (const key of unsafeKeys) expect(keys).not.toContain(`answer.${key}`);
    expect(keys).toContain("answer.notice-period");
    for (const value of unsafeKeys.map((key) => `secret-${key}`)) {
      expect(facts.some((fact) => fact.value === value)).toBe(false);
    }
  });

  it("is deterministic: identical inputs produce an identical inventory", () => {
    expect(keyFacts(profile, answers, snapshot)).toEqual(keyFacts(profile, answers, snapshot));
  });
});

const composeFrom = (tokens: ReadonlyArray<string>): string =>
  `CV using ${tokens.join(", ")} as its spine.`;

describe("renderInventory", () => {
  it("renders one double-brace token per fact", () => {
    const text = renderInventory(factsFor());
    expect(text.split("\n")).toHaveLength(factsFor().length);
    expect(text).toContain("{{profile.headline}}");
    expect(text).toContain("{{profile.headline}}");
    // renderInventory of an untargeted inventory carries no vacancy keys:
    expect(renderInventory(factsFor(undefined)).includes("{{job.")).toBe(false);
  });

  it("carries no raw values anywhere in the prompt inventory", () => {
    const text = renderInventory(factsFor(snapshot));
    for (const value of ["Support engineer", "Acme", "Zendesk", "One month", "Bakes bread."]) {
      expect(text.includes(value)).toBe(false);
    }
  });
});

describe("finalize", () => {
  const facts = factsFor(snapshot);
  const byKey = new Map(facts.map((fact) => [fact.key, fact.value]));

  it("substitutes every referenced key and leaves no braces behind", () => {
    const tokens = ["profile.headline", "profile.skills.0", "job.title"];
    const result = finalize(composeFrom(tokens.map((t) => `{{${t}}}`)), facts);
    expect(result._tag).toBe("Finalized");
    if (result._tag !== "Finalized") return;
    for (const token of tokens) {
      expect(result.content.includes(byKey.get(token)!)).toBe(true);
    }
    expect(result.content.includes("{{")).toBe(false);
  });

  it("detects a model that echoed raw values instead of tokens", () => {
    const result = finalize(`A great ${byKey.get("profile.skills.0")!} specialist CV.`, facts);
    expect(result._tag).toBe("RawValueLeak");
    if (result._tag !== "RawValueLeak") return;
    expect(result.keys).toEqual(["profile.skills.0"]);
  });

  it("rejects tokens outside the inventory rather than storing them", () => {
    const result = finalize(composeFrom(["{{profile.headline}}", "{{nonexistent.key}}"]), facts);
    expect(result._tag).toBe("UnresolvedPlaceholder");
  });

  it("rejects malformed brace soup the grammar cannot match", () => {
    expect(finalize("text with {{ a stray brace", facts)._tag).toBe("UnresolvedPlaceholder");
  });

  it("leaves brace-bearing values inert after substitution — never re-scanned", () => {
    const tricky: ReadonlyArray<KeyedFact> = [{ key: "profile.headline", value: "{{x}} y }}" }];
    const result = finalize("Headline was {{profile.headline}}.", tricky);
    expect(result._tag).toBe("Finalized");
    if (result._tag !== "Finalized") return;
    expect(result.content).toBe("Headline was {{x}} y }}.");
  });

  it("does not flag values shorter than four characters as leaks", () => {
    const tiny: ReadonlyArray<KeyedFact> = [{ key: "profile.location", value: "Oslo" }];
    // "Oslo" is exactly 4 chars and scanned; "AI" would not be.
    const shortFacts: ReadonlyArray<KeyedFact> = [{ key: "profile.languages", value: "AI" }];
    expect(finalize("Fluent in AI systems.", shortFacts)).toEqual({
      _tag: "Finalized",
      content: "Fluent in AI systems.",
    });
    void tiny;
  });
});

// --- Property tests (fast-check): bounded arrays so the suite stays fast ----

const smallText = fc
  .string({ minLength: 0, maxLength: 40 })
  .filter((s) => !s.includes("{{") && s.trim().length > 0);

const arbProfile: fc.Arbitrary<Profile> = fc.record({
  headline: smallText,
  summary: smallText,
  location: smallText,
  languages: smallText,
  skills: fc.array(smallText, { maxLength: 3 }),
  experience: fc.array(
    fc.record({
      title: smallText,
      employer: smallText,
      period: smallText,
      highlights: fc.array(smallText, { maxLength: 2 }),
    }),
    { maxLength: 2 },
  ),
  education: fc.array(smallText, { maxLength: 2 }),
  preferences: fc.constant({
    desiredRoles: [],
    desiredLocations: [],
    excludedTerms: [],
  }),
});

const arbAnswers: fc.Arbitrary<ReadonlyArray<Answer>> = fc
  .array(
    fc.tuple(
      smallText.filter((s) => /^[A-Za-z0-9_-]+$/.test(s)),
      smallText,
    ),
    {
      maxLength: 3,
    },
  )
  .map((pairs) => pairs.map(([question, value]) => answer(question, question, value)));

describe("key round-trip property (WS-0019 b)", () => {
  it("for arbitrary inputs and arbitrary token references, finalize succeeds iff no raw value appeared, every referenced value lands, nothing unreferenced does, and no brace survives", () => {
    const property = fc.property(
      arbProfile,
      arbAnswers,
      fc.boolean(),
      fc.array(fc.integer({ min: 0, max: 30 }), { maxLength: 6 }),
      (prof, ans, targeted, pickIndices) => {
        const snapshotMaybe: JobSnapshot | undefined = targeted
          ? { ...snapshot, title: `${snapshot.title} ${pickIndices.length}` }
          : undefined;
        const facts = keyFacts(prof, ans, snapshotMaybe);
        if (facts.length === 0) return true;

        const referenced: Array<KeyedFact> = [];
        for (const index of pickIndices) referenced.push(facts[index % facts.length]!);

        // Model text: noise plus verbatim copies of the referenced tokens.
        const modelText =
          "Plan:\n" + referenced.map((fact) => `- use {{${fact.key}}} here`).join("\n");

        // The model is honest iff it wrote no real value verbatim.
        const honest = facts.every(
          (fact) => fact.value.length < 4 || !modelText.includes(fact.value),
        );
        const result = finalize(modelText, facts);

        if (!honest) return result._tag === "RawValueLeak";
        if (result._tag !== "Finalized") return false;

        const referencedValues = referenced.map((fact) => fact.value);
        const unreferenced = facts.filter((fact) => !referenced.some((r) => r.key === fact.key));
        return (
          referencedValues.every((value) => result.content.includes(value)) &&
          unreferenced.every(
            (fact) => fact.value.length < 4 || !result.content.includes(fact.value),
          ) &&
          !result.content.includes("{{")
        );
      },
    );
    expect(fc.assert(property, { numRuns: 200 })).toBeUndefined();
  });
});
