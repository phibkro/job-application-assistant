import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { ProfileId, ProposalId } from "@job-index/domain/Ids";
import { QuestionKey } from "@job-index/domain/Answer";
import type { AnswerShape } from "@job-index/domain/Answer";
import type { Profile } from "@job-index/domain/Profile";
import { Profiles } from "../services/Accounts.ts";
import type { Database } from "../services/Database.ts";
import { acceptProposal, layer, ProfileDecisionAtomicityDefect, unansweredOf } from "./profiles.ts";
import { emptyState, fakeDatabaseLayer, type FakeState } from "./fixtures.ts";

const profileId = Schema.decodeUnknownSync(ProfileId)("profile-1");
const question = (raw: string) => Schema.decodeUnknownSync(QuestionKey)(raw);
const proposalId = Schema.decodeUnknownSync(ProposalId)("proposal-defect");

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

describe("versioned get / set", () => {
  it("returns an empty CV with a null version when no profile row exists", async () => {
    const current = await run(
      emptyState(),
      withProfiles((profiles) => profiles.getVersioned(profileId)),
    );
    expect(current).toEqual({
      profile: {
        headline: "",
        summary: "",
        location: "",
        languages: "",
        skills: [],
        experience: [],
        education: [],
      },
      profileUpdatedAt: null,
    });
  });

  it("setVersioned then getVersioned round-trips the CV and new version", async () => {
    const state = emptyState();
    const written = await run(
      state,
      withProfiles((profiles) => profiles.setVersioned(profileId, sample, null).pipe(Effect.orDie)),
    );
    const read = await run(
      state,
      withProfiles((profiles) => profiles.getVersioned(profileId)),
    );
    expect(written.profile).toEqual(sample);
    expect(written.profileUpdatedAt).not.toBeNull();
    expect(read).toEqual(written);
  });

  it("rejects a stale replacement once and preserves the winning profile", async () => {
    const state = emptyState();
    const result = await run(
      state,
      withProfiles((profiles) =>
        Effect.gen(function* () {
          const first = yield* profiles.setVersioned(profileId, sample, null).pipe(Effect.orDie);
          const winner = yield* profiles
            .setVersioned(profileId, { ...sample, headline: "Winner" }, first.profileUpdatedAt)
            .pipe(Effect.orDie);
          const stale = yield* Effect.exit(
            profiles.setVersioned(
              profileId,
              { ...sample, headline: "Stale" },
              first.profileUpdatedAt,
            ),
          );
          return {
            winner,
            stale,
            current: yield* profiles.getVersioned(profileId),
          };
        }),
      ),
    );

    expect(result.stale._tag).toBe("Failure");

    expect(result.current).toEqual(result.winner);
    expect(result.current.profile.headline).toBe("Winner");
  });
});
describe("proposal decision affected vectors", () => {
  it("dies with a typed defect for a mixed vector", async () => {
    const database: Database["Service"] = {
      query: <A>() => Effect.succeed([] as ReadonlyArray<A>),
      run: () => Effect.void,
      runAffected: () => Effect.succeed(0),
      atomicAffected: () => Effect.succeed([1, 0]),
      atomic: () => Effect.void,
    };
    const exit = await Effect.runPromise(
      Effect.exit(
        acceptProposal(
          database,
          profileId,
          proposalId,
          "2026-08-25T03:00:00.000Z",
          (profile) => profile,
        ),
      ),
    );

    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      expect(String(exit.cause)).toContain(ProfileDecisionAtomicityDefect.name);
    }
  });
});

/** How a form posed the question: its visible label and the control it used. */
const posed = (label: string, shape: AnswerShape = { _tag: "Text" }) => ({ label, shape });

describe("answer / answers", () => {
  it("records a new answer and lists it back", async () => {
    const state = emptyState();
    await run(
      state,
      withProfiles((profiles) =>
        profiles.answer(profileId, question("years-experience"), "5", posed("Years of experience")),
      ),
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
      withProfiles((profiles) =>
        profiles.answer(profileId, question("years-experience"), "5", posed("Years of experience")),
      ),
    );
    await run(
      state,
      withProfiles((profiles) =>
        profiles.answer(profileId, question("years-experience"), "6", posed("Years of experience")),
      ),
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
        profiles.answer(profileId, question("headline"), "Support engineer", posed("Headline")),
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
