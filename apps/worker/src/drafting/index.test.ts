import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import { Drafting } from "../services/Drafting.ts";
import { layer } from "./index.ts";
import { testJob, testProfile } from "./fixtures.ts";

const run = <A, E>(effect: Effect.Effect<A, E, Drafting>) =>
  Effect.runPromise(effect.pipe(Effect.provide(layer)));

describe("layer", () => {
  it("composes a template CV and letter for a complete profile", async () => {
    const profile = testProfile({ headline: "Customer support specialist" });
    const job = testJob();

    const documents = await run(
      Effect.gen(function* () {
        const drafting = yield* Drafting;
        return yield* drafting.compose(profile, job);
      }),
    );

    expect(documents.generator).toBe("template");
    expect(documents.cv).toContain("Customer support specialist");
    expect(documents.letter).toContain(job.title);
  });

  it("fails with ProfileIncomplete when the profile has neither a headline nor experience", async () => {
    const profile = testProfile();
    const job = testJob();

    const failure = await run(
      Effect.gen(function* () {
        const drafting = yield* Drafting;
        return yield* drafting.compose(profile, job);
      }).pipe(Effect.flip),
    );

    expect(failure._tag).toBe("ProfileIncomplete");
  });

  it("accepts a profile with experience but no headline", async () => {
    const profile = testProfile({
      experience: [
        { title: "Barista", employer: "Kaffebrenneriet", period: "2019-2022", highlights: [] },
      ],
    });
    const job = testJob();

    const documents = await run(
      Effect.gen(function* () {
        const drafting = yield* Drafting;
        return yield* drafting.compose(profile, job);
      }),
    );

    expect(documents.cv).toContain("Barista");
  });
});
