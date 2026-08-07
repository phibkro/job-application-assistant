import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { ProfileId } from "@job-index/domain/Ids";
import { QuestionKey } from "@job-index/domain/Answer";
import type { Profile } from "@job-index/domain/Profile";
import { Profiles } from "../services/Accounts.ts";
import { layer } from "./profiles.ts";
import { unansweredOf } from "./profiles.ts";
import { emptyState, fakeDatabaseLayer, type FakeState } from "./fixtures.ts";

const profileId = Schema.decodeUnknownSync(ProfileId)("profile-1");
const question = (raw: string) => Schema.decodeUnknownSync(QuestionKey)(raw);

const run = <A>(state: FakeState, effect: Effect.Effect<A, never, Profiles>) =>
  Effect.runPromise(effect.pipe(Effect.provide(layer), Effect.provide(fakeDatabaseLayer(state))));

const withProfiles = <A>(f: (profiles: Profiles["Service"]) => Effect.Effect<A>) =>
  Effect.gen(function* () {
    const profiles = yield* Profiles;
    return yield* f(profiles);
  });

const sample: Profile = {
  headline: "Support engineer",
  summary: "Five years in customer support.",
  location: "Oslo",
  languages: "Norwegian, English",
  skills: ["Zendesk"],
  experience: [],
  education: [],
};

describe("get / set", () => {
  it("returns an empty CV for a profile with none set yet", async () => {
    const profile = await run(
      emptyState(),
      withProfiles((profiles) => profiles.get(profileId)),
    );
    expect(profile).toEqual({
      headline: "",
      summary: "",
      location: "",
      languages: "",
      skills: [],
      experience: [],
      education: [],
    });
  });

  it("set then get round-trips the CV", async () => {
    const state = emptyState();
    await run(
      state,
      withProfiles((profiles) => profiles.set(profileId, sample)),
    );
    const read = await run(
      state,
      withProfiles((profiles) => profiles.get(profileId)),
    );
    expect(read).toEqual(sample);
  });
});

describe("answer / answers", () => {
  it("records a new answer and lists it back", async () => {
    const state = emptyState();
    await run(
      state,
      withProfiles((profiles) => profiles.answer(profileId, question("years-experience"), "5")),
    );

    const answers = await run(
      state,
      withProfiles((profiles) => profiles.answers(profileId)),
    );
    expect(answers).toHaveLength(1);
    expect(answers[0]?.value).toBe("5");
    expect(answers[0]?.origin).toBe("stated");
  });

  it("updates the value of an already-answered question rather than duplicating it", async () => {
    const state = emptyState();
    await run(
      state,
      withProfiles((profiles) => profiles.answer(profileId, question("years-experience"), "5")),
    );
    await run(
      state,
      withProfiles((profiles) => profiles.answer(profileId, question("years-experience"), "6")),
    );

    const answers = await run(
      state,
      withProfiles((profiles) => profiles.answers(profileId)),
    );
    expect(answers).toHaveLength(1);
    expect(answers[0]?.value).toBe("6");
  });
});

describe("unanswered", () => {
  it("is exactly the asked questions this profile has not answered", async () => {
    const state = emptyState();
    await run(
      state,
      withProfiles((profiles) =>
        profiles.answer(profileId, question("headline"), "Support engineer"),
      ),
    );

    const asked = [question("headline"), question("visa-status"), question("notice-period")];
    const result = await run(
      state,
      withProfiles((profiles) => profiles.unanswered(profileId, asked)),
    );

    expect(result).toEqual([question("visa-status"), question("notice-period")]);
  });

  it("is empty when nothing was asked", async () => {
    const result = await run(
      emptyState(),
      withProfiles((profiles) => profiles.unanswered(profileId, [])),
    );
    expect(result).toEqual([]);
  });
});

describe("unansweredOf (pure)", () => {
  it("returns every asked question absent from the answered set, and property-holds across random sets", () =>
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.string({ minLength: 1, maxLength: 12 })),
        fc.array(fc.string({ minLength: 1, maxLength: 12 })),
        (asked, answeredList) => {
          const answered = new Set(answeredList);
          const askedKeys = asked.map((raw) => question(raw));
          const result = unansweredOf(askedKeys, answered);

          // Every result came from `asked`, in order, and none of it is answered.
          expect(askedKeys.filter((q) => !answered.has(q))).toEqual(result);
          for (const q of result) expect(answered.has(q)).toBe(false);
        },
      ),
    ));
});
