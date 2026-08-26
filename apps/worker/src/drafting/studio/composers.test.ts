import { describe, expect, it } from "vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import type { Answer, AnswerShape } from "@job-index/domain/Answer";
import type { JobSnapshot } from "@job-index/domain/Job";
import type { Profile } from "@job-index/domain/Profile";
import { TemplateStudioComposer } from "../../services/Studio.ts";
import { composeCv } from "../composeCv.ts";
import { composeLetter } from "../composeLetter.ts";
import { renderAnswers } from "../renderAnswers.ts";
import { layer, composeGeneralLetter, composeDocument } from "./index.ts";

/**
 * WS-0018 acceptance (a): determinism and grounding. The template composer's
 * whole authority is where its bytes may come from — these tests pin each
 * dispatch branch to the exact function that owns it, by equality.
 */

const profile: Profile = {
  headline: "Frontend engineer",
  summary: "Eight years building interfaces.",
  location: "Oslo",
  languages: "Norwegian, English",
  skills: ["TypeScript", "React", "SQL"],
  experience: [
    {
      title: "Senior engineer",
      employer: "Nordic Tech AS",
      period: "2021–2026",
      highlights: ["Led the design-system rewrite", "Mentored three juniors"],
    },
    {
      title: "Barista",
      employer: "Kaffebrenneriet",
      period: "2019–2021",
      highlights: ["Trained new staff"],
    },
  ],
  education: ["BSc Informatics, UiO"],
};

function answer(label: string, shapeTag: AnswerShape["_tag"], value: string): Answer {
  // Plain-object fixture (the `testAnswer` precedent in `drafting/fixtures.ts`):
  // the class instance's `Sensitive`/JSON fields do not expose plain
  // properties a test can read back, and `renderAnswers` reads them as such.
  return {
    profileId: "profile_1" as never,
    question: label.toLowerCase().replace(/\s+/g, "_") as never,
    label,
    shape: { _tag: shapeTag } as unknown as AnswerShape,
    value,
    origin: "stated" as const,
    createdAt: DateTime.nowUnsafe(),
    updatedAt: DateTime.nowUnsafe(),
  } as unknown as Answer;
}

const answers: ReadonlyArray<Answer> = [
  answer("Notice period", "Text", "Three months"),
  answer("Willing to relocate", "Boolean", "true"),
];

const snapshot: JobSnapshot = {
  title: "Frontendutvikler",
  employerName: "Nordic Tech AS",
  location: "Oslo",
  description: "Vi ser etter en frontendutvikler med TypeScript og React. Kontor i Oslo.",
  applicationUrl: "https://example.com/advert",
  publishedAt: "2026-08-01T00:00:00Z",
};

const run = <A>(effect: Effect.Effect<A, unknown, TemplateStudioComposer>) =>
  Effect.runPromise(Effect.provide(effect, layer));

describe("template studio composers — grounding (WS-0018 a)", () => {
  it("general CV equals renderAnswers for the same inputs", async () => {
    const composed = await run(
      Effect.flatMap(TemplateStudioComposer, (s) => s.compose(profile, answers, "cv", undefined)),
    );
    expect(composed.engine).toBe("template");
    expect(composed.kind).toBe("cv");
    expect(composed.content).toBe(renderAnswers(profile, answers));
    expect(composed.content).toContain("ADDITIONAL INFORMATION");
    expect(composed.content).toContain("Notice period: Three months");
    expect(composed.content).toContain("Willing to relocate: Yes");
  });

  it("general CV omits the answers section when no answers exist", async () => {
    const composed = await run(
      Effect.flatMap(TemplateStudioComposer, (s) => s.compose(profile, [], "cv", undefined)),
    );
    expect(composed.content).not.toContain("ADDITIONAL INFORMATION");
  });

  it("general letter names only profile-borne facts and is deterministic", () => {
    const first = composeDocument(profile, answers, "letter", undefined);
    const second = composeDocument(profile, answers, "letter", undefined);
    expect(first).toBe(second);
    expect(first).toContain("Frontend engineer");
    expect(first).toContain("My work centres on TypeScript, React, SQL.");
    expect(first).toContain("Most recently I worked as Senior engineer at Nordic Tech AS");
    expect(first).not.toContain(snapshot.title);
  });

  it("job-specific CV equals composeCv verbatim for the same inputs", async () => {
    const composed = await run(
      Effect.flatMap(TemplateStudioComposer, (s) => s.compose(profile, answers, "cv", snapshot)),
    );
    expect(composed.content).toBe(composeCv(profile, snapshot));
  });

  it("job-specific letter equals composeLetter verbatim and upholds the skills guarantee", async () => {
    const composed = await run(
      Effect.flatMap(TemplateStudioComposer, (s) =>
        s.compose(profile, answers, "letter", snapshot),
      ),
    );
    expect(composed.content).toBe(composeLetter(profile, snapshot));
    // Inherited matchedSkills guarantee: SQL appears in no advert, so the
    // letter must not name it even though the profile lists it.
    expect(composed.content).toContain("TypeScript");
    expect(composed.content).not.toContain("SQL");
    // Stored answers never reach job-specific documents — they must match
    // what the apply loop composes from the same inputs.
    expect(composed.content).not.toContain("Notice period");
  });

  it("every kind is deterministic across runs", async () => {
    const pairs = await Promise.all(
      (["cv", "letter"] as const).flatMap((kind) =>
        [undefined, snapshot].map(async (job) => {
          // Two independent runs must compose byte-identical documents.
          const [first, second] = await Promise.all([
            run(
              Effect.flatMap(TemplateStudioComposer, (s) => s.compose(profile, answers, kind, job)),
            ),
            run(
              Effect.flatMap(TemplateStudioComposer, (s) => s.compose(profile, answers, kind, job)),
            ),
          ]);
          return second.content === first.content;
        }),
      ),
    );
    expect(pairs.every((identical) => identical)).toBe(true);
  });

  it("no composer reads preferences", async () => {
    const withPreferences: Profile = {
      ...profile,
      preferences: { desiredRoles: ["Astronaut"], desiredLocations: ["Mars"], excludedTerms: [] },
    };
    const cv = await run(
      Effect.flatMap(TemplateStudioComposer, (s) =>
        s.compose(withPreferences, [], "cv", undefined),
      ),
    );
    expect(cv.content).not.toContain("Astronaut");
    expect(cv.content).not.toContain("Mars");
  });
});

describe("template studio empty-profile gate (WS-0018 a)", () => {
  const empty: Profile = {
    ...profile,
    headline: "",
    summary: "",
    experience: [],
    skills: [],
    education: [],
  };

  it("refuses all four kinds when there is neither headline nor experience", async () => {
    const results = await Promise.all(
      (["cv", "letter"] as const).flatMap((kind) =>
        [undefined, snapshot].map(async (job) =>
          Effect.runPromiseExit(
            Effect.provide(
              Effect.flatMap(TemplateStudioComposer, (s) => s.compose(empty, [], kind, job)),
              layer,
            ),
          ),
        ),
      ),
    );
    for (const result of results) {
      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure") {
        expect(String(result.cause)).toContain("ProfileIncomplete");
      }
    }
  });

  it("a headline alone is enough to draft", async () => {
    const headlineOnly = { ...empty, headline: "Baker" };
    const composed = await run(
      Effect.flatMap(TemplateStudioComposer, (s) =>
        s.compose(headlineOnly, [], "letter", undefined),
      ),
    );
    expect(composed.content).toBe(composeGeneralLetter(headlineOnly));
  });
});
