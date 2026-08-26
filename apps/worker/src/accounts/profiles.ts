import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { Answer, QuestionKey } from "@job-index/domain/Answer";
import type { AnswerShape } from "@job-index/domain/Answer";
import type { Profile } from "@job-index/domain/Profile";
import type { ProfileId, ProposalId } from "@job-index/domain/Ids";
import { Profiles, StaleProfileWrite, type VersionedProfile } from "../services/Accounts.ts";
import { Database, type Write } from "../services/Database.ts";
import {
  ACTIVE_ERASURE,
  emptyProfile,
  encodeErasureRow,
  profileWriteForPendingProposal,
  readProfileRow,
  toDomainProfile,
  toVersionedProfile,
  writeProfile,
  writeProfileIfVersion,
} from "./profileRow.ts";
import { UPDATE_AI_CONSENT } from "./sql.ts";
import { markAcceptedAfterProfileWrite } from "../db/repositories/Proposals.ts";

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

export class ProfileDecisionAtomicityDefect extends Error {
  readonly name = "ProfileDecisionAtomicityDefect";

  constructor(readonly affected: ReadonlyArray<number>) {
    super(`profile proposal decision returned affected vector [${affected.join(",")}]`);
  }
}

/**
 * One profile-first proposal acceptance attempt.
 *
 * A `[0, 0]` loss is expected and lets the handler classify the owner-scoped
 * proposal before retrying. Any mixed vector violates the SQL protocol.
 */
export const acceptProposal = (
  db: DatabaseService,
  profileId: ProfileId,
  proposalId: ProposalId,
  decidedAt: string,
  merge: (profile: Profile) => Profile,
): Effect.Effect<VersionedProfile | undefined> =>
  Effect.gen(function* () {
    const existing = yield* readProfileRow(db, profileId);
    const profile = merge(existing === undefined ? emptyProfile : toDomainProfile(existing));
    const prepared = profileWriteForPendingProposal(
      profileId,
      profile,
      proposalId,
      existing,
      decidedAt,
    );
    const affected = yield* db.atomicAffected([
      prepared.write,
      markAcceptedAfterProfileWrite(proposalId, profileId, decidedAt),
    ]);
    if (affected[0] === 1 && affected[1] === 1 && affected.length === 2) {
      const persisted = yield* readProfileRow(db, profileId);
      if (persisted !== undefined) return toVersionedProfile(persisted);
    } else if (affected[0] === 0 && affected[1] === 0 && affected.length === 2) {
      return undefined;
    }
    return yield* Effect.die(new ProfileDecisionAtomicityDefect(affected));
  });

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

/** A field-only write that cannot create a row or revive a non-active one. */
export const aiConsentWrite = (profile: ProfileId, enabled: boolean): Write => ({
  sql: UPDATE_AI_CONSENT,
  bindings: [enabled ? 1 : 0, profile, encodeErasureRow(ACTIVE_ERASURE)],
});

export const layer = Layer.effect(
  Profiles,
  Effect.gen(function* () {
    const db = yield* Database;

    const getVersioned = (profile: ProfileId): Effect.Effect<VersionedProfile> =>
      readProfileRow(db, profile).pipe(Effect.map(toVersionedProfile));

    const get = (profile: ProfileId): Effect.Effect<Profile> =>
      getVersioned(profile).pipe(Effect.map((versioned) => versioned.profile));

    const set = (profile: ProfileId, value: Profile): Effect.Effect<Profile> =>
      Effect.gen(function* () {
        const now = DateTime.formatIso(yield* DateTime.now);
        yield* writeProfile(db, profile, value, now);
        return value;
      });

    const setVersioned = (
      profile: ProfileId,
      value: Profile,
      expectedUpdatedAt: string | null,
    ): Effect.Effect<VersionedProfile, StaleProfileWrite> =>
      Effect.gen(function* () {
        const now = DateTime.formatIso(yield* DateTime.now);
        const written = yield* writeProfileIfVersion(db, profile, value, expectedUpdatedAt, now);
        if (written !== undefined) return written;
        const actual = yield* getVersioned(profile);
        return yield* Effect.fail(
          new StaleProfileWrite({
            expectedUpdatedAt,
            actualUpdatedAt: actual.profileUpdatedAt,
          }),
        );
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

    const aiConsent = (profile: ProfileId): Effect.Effect<boolean> =>
      readProfileRow(db, profile).pipe(Effect.map((row) => row?.aiAssist === 1));

    const setAiConsent = (profile: ProfileId, enabled: boolean): Effect.Effect<void> => {
      const write = aiConsentWrite(profile, enabled);
      return db.run(write.sql, write.bindings);
    };

    return {
      get,
      set,
      getVersioned,
      setVersioned,
      answers,
      answer,
      unanswered,
      aiConsent,
      setAiConsent,
    };
  }),
);
