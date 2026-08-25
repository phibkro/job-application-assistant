import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { targetOf } from "@job-index/domain/Proposals";
import { HeuristicInference } from "../../services/Inference.ts";
import { layer as heuristicLayer } from "./index.ts";

/**
 * The deterministic contract of the heuristic tier (WS-0016 acceptance (a)):
 * against one realistic pasted CV, the extractor proposes the facts the
 * document actually states; identical input twice yields byte-identical
 * proposals; garbage yields nothing rather than an error.
 */

const CV_FIXTURE = `Kari Nordmann
Senior frontendutvikler

SUMMARY
Frontend developer with eight years of experience building accessible web applications in React and TypeScript.

Location: Oslo
Languages: Norwegian, English

EXPERIENCE
Senior frontendutvikler - Finn AS
2018 - present
- Led the migration to TypeScript across 40 packages
- Mentored three junior developers

Frontendutvikler - Telenor
2014 - 2018
Built the customer self-service portal in Angular.

SKILLS
TypeScript, React, CSS, Playwright • Accessibility

EDUCATION
Bachelor i informatikk, Universitetet i Bergen
Master in Computer Science, NTNU

Seeking: senior frontend roles`;

describe("HeuristicInference", () => {
  it("extracts headline, summary, skills, experience, education and preferences from a pasted CV", async () => {
    const drafts = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const heuristics = yield* HeuristicInference;
          return yield* heuristics.propose(CV_FIXTURE);
        }),
        heuristicLayer,
      ),
    );

    const paths = drafts.map((d) => d.fieldPath);
    expect(paths).toContain("headline");
    expect(paths).toContain("summary");
    expect(paths.filter((p) => p.startsWith("skills.")).length).toBeGreaterThanOrEqual(3);
    expect(paths.filter((p) => p.startsWith("experience.")).length).toBeGreaterThanOrEqual(2);
    expect(paths.filter((p) => p.startsWith("education.")).length).toBeGreaterThanOrEqual(1);
    expect(new Set(paths.filter((p) => p.startsWith("skills."))).size).toBe(
      paths.filter((p) => p.startsWith("skills.")).length,
    );
    expect(paths.some((p) => p.startsWith("preferences."))).toBe(true);

    const headline = drafts.find((d) => d.fieldPath === "headline");
    expect(headline?.proposedValue).toBe("Kari Nordmann");

    const experience = drafts.filter((d) => d.fieldPath.startsWith("experience."));
    const finn = experience.find((d) =>
      (d.proposedValue as { employer: string }).employer.includes("Finn"),
    );
    expect(finn).toBeDefined();
    const period =
      finn === undefined ? "" : ((finn.proposedValue as { period: string }).period ?? "");
    expect(period).toContain("2018");
    // Evidence quotes come from the document itself.
    const evidenceLength = finn?.evidenceExcerpt.length ?? 0;
    expect(evidenceLength).toBeGreaterThan(0);
    const evidence =
      finn === undefined ? "never" : (finn.evidenceExcerpt.split(" · ")[0] ?? "never");
    expect(CV_FIXTURE).toContain(evidence);

    for (const draft of drafts) {
      const target = targetOf(draft.fieldPath);
      if (target === undefined) throw new Error(`missing target schema for ${draft.fieldPath}`);
      expect(() => Schema.decodeUnknownSync(target)(draft.proposedValue)).not.toThrow();
    }
  });

  it("labels confidence from evidence strength", async () => {
    const drafts = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const heuristics = yield* HeuristicInference;
          return yield* heuristics.propose(CV_FIXTURE);
        }),
        heuristicLayer,
      ),
    );
    // Heading-anchored summary is high; the headline (no heading above it) is medium at best.
    const summary = drafts.find((d) => d.fieldPath === "summary");
    expect(summary?.confidence).toBe("high");
    const headline = drafts.find((d) => d.fieldPath === "headline");
    expect(["medium", "low"]).toContain(headline?.confidence);
  });

  it("is deterministic: identical input produces deep-equal proposal sets", async () => {
    const proposeOnce = () =>
      Effect.runPromise(
        Effect.provide(
          Effect.gen(function* () {
            const heuristics = yield* HeuristicInference;
            return yield* heuristics.propose(CV_FIXTURE);
          }),
          heuristicLayer,
        ),
      );
    const first = await proposeOnce();
    const second = await proposeOnce();
    expect(second).toEqual(first);
  });

  it("returns an empty set for garbage or empty input without throwing", async () => {
    const results = await Promise.all(
      ["", "   \n\n  ", "lorem ipsum dolor sit amet 12345 !@#$%"].map((input) =>
        Effect.runPromise(
          Effect.provide(
            Effect.gen(function* () {
              const heuristics = yield* HeuristicInference;
              return yield* heuristics.propose(input);
            }),
            heuristicLayer,
          ),
        ),
      ),
    );
    expect(results).toEqual([[], [], []]);
  });
});
