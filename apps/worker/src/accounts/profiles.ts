import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { Answer, QuestionKey } from "@job-index/domain/Answer";
import type { AnswerShape } from "@job-index/domain/Answer";
import type { Profile } from "@job-index/domain/Profile";
import type { ProfileId } from "@job-index/domain/Ids";
import { Profiles } from "../services/Accounts.ts";
import { Database } from "../services/Database.ts";
import { emptyProfile, readProfileRow, toDomainProfile, writeProfile } from "./profileRow.ts";

/**
 * The gap this slot reported is closed: `Profiles.answer` now carries the
 * `label` and `shape` the form asked with, so a new question is recorded as it
 * was actually posed rather than defaulted to short free text. `origin` stays
 * `"stated"` here, and correctly — a person answering through this API is,
 * definitionally, stating it; a `"learned"` answer arrives from the agent
 * session instead, which is a different caller.
 *
 * An already-known question keeps its recorded label and shape: the form that
 * asked first defined it, and a later form's phrasing of the same question is
 * not a reason to rewrite history.
 */
interface AnswerRow {
  readonly profileId: string;
  readonly question: string;
  readonly label: string;
  readonly shape: string;
  readonly value: string;
  readonly origin: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

type DatabaseService = Database["Service"];

const findAnswerRow = (
  db: DatabaseService,
  profile: ProfileId,
  question: QuestionKey,
): Effect.Effect<AnswerRow | undefined> =>
  db
    .query<AnswerRow>(
      "-- accounts:findAnswer\nSELECT * FROM answers WHERE profileId = ? AND question = ?",
      [profile, question],
    )
    .pipe(Effect.map((rows) => rows[0]));

const upsertAnswer = (
  db: DatabaseService,
  profile: ProfileId,
  question: QuestionKey,
  value: string,
  asked: { readonly label: string; readonly shape: AnswerShape },
): Effect.Effect<void> =>
  Effect.gen(function* () {
    const existing = yield* findAnswerRow(db, profile, question);
    const now = DateTime.formatIso(yield* DateTime.now);
    if (existing === undefined) {
      yield* db.run(
        "-- accounts:insertAnswer\nINSERT INTO answers (profileId, question, label, shape, value, origin, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [profile, question, asked.label, JSON.stringify(asked.shape), value, "stated", now, now],
      );
    } else {
      yield* db.run(
        "-- accounts:updateAnswer\nUPDATE answers SET value = ?, updatedAt = ? WHERE profileId = ? AND question = ?",
        [value, now, profile, question],
      );
    }
  });

/** The asked questions this profile has no answer for. Input to the learning loop, so exactness matters more than cleverness. */
export const unansweredOf = (
  asked: ReadonlyArray<QuestionKey>,
  answered: ReadonlySet<string>,
): ReadonlyArray<QuestionKey> => asked.filter((question) => !answered.has(question));

if (import.meta.vitest) {
  const { it, expect } = import.meta.vitest;
  it("keeps only asked questions absent from the answered set, in order", () => {
    const decode = Schema.decodeUnknownSync(QuestionKey);
    const asked = ["headline", "years-experience", "visa-status"].map((raw) => decode(raw));
    expect(unansweredOf(asked, new Set(["years-experience"]))).toEqual(["headline", "visa-status"]);
  });
}

export const layer = Layer.effect(
  Profiles,
  Effect.gen(function* () {
    const db = yield* Database;

    const get = (profile: ProfileId): Effect.Effect<Profile> =>
      readProfileRow(db, profile).pipe(
        Effect.map((row) => (row === undefined ? emptyProfile : toDomainProfile(row))),
      );

    const set = (profile: ProfileId, value: Profile): Effect.Effect<Profile> =>
      Effect.gen(function* () {
        const now = DateTime.formatIso(yield* DateTime.now);
        yield* writeProfile(db, profile, value, now);
        return value;
      });

    const answers = (profile: ProfileId): Effect.Effect<ReadonlyArray<Answer>> =>
      db
        .query<AnswerRow>("-- accounts:listAnswers\nSELECT * FROM answers WHERE profileId = ?", [
          profile,
        ])
        .pipe(Effect.map((rows) => rows.map((row) => Schema.decodeUnknownSync(Answer)(row))));

    const answer = (
      profile: ProfileId,
      question: QuestionKey,
      value: string,
      asked: { readonly label: string; readonly shape: AnswerShape },
    ): Effect.Effect<void> => upsertAnswer(db, profile, question, value, asked);

    const unanswered = (
      profile: ProfileId,
      asked: ReadonlyArray<QuestionKey>,
    ): Effect.Effect<ReadonlyArray<QuestionKey>> =>
      db
        .query<{ question: string }>(
          "-- accounts:answeredQuestions\nSELECT DISTINCT question FROM answers WHERE profileId = ?",
          [profile],
        )
        .pipe(Effect.map((rows) => unansweredOf(asked, new Set(rows.map((row) => row.question)))));

    return { get, set, answers, answer, unanswered };
  }),
);
