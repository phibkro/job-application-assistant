import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { Database } from "../services/Database.ts";
import { sha256Hex } from "./hash.ts";

/**
 * The in-test double for `Database`, owned by this slot per the brief ("do
 * not import another slot's files"). It is not a SQL engine: each statement
 * this slot issues carries a leading `-- accounts:<op>` comment (valid SQL,
 * harmless against a real connection) that this file switches on directly,
 * rather than parsing the query text. That keeps the fake exactly as capable
 * as the handful of statements this slot actually sends, and no more.
 */

export interface SeedSession {
  readonly id: string;
  readonly principalId: string;
  readonly profileId: string;
  readonly tokenHash: string;
  readonly expiresAt: number;
  readonly revokedAt: string | null;
}

export interface SeedPrincipal {
  readonly id: string;
  readonly profileId: string;
  readonly apiKeyHash: string;
}

export interface SeedProfileRow {
  readonly profileId: string;
  readonly headline: string;
  readonly summary: string;
  readonly location: string;
  readonly languages: string;
  readonly skills: string;
  readonly experience: string;
  readonly education: string;
  readonly erasure: string;
  readonly updatedAt: string;
}

export interface SeedAnswer {
  readonly profileId: string;
  readonly question: string;
  readonly label: string;
  readonly shape: string;
  readonly value: string;
  readonly origin: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface FakeState {
  sessions: Array<SeedSession>;
  principals: Array<SeedPrincipal>;
  profiles: Array<SeedProfileRow>;
  answers: Array<SeedAnswer>;
}

export const emptyState = (): FakeState => ({
  sessions: [],
  principals: [],
  profiles: [],
  answers: [],
});

/** The raw secret a caller would present, hashed the same way `authenticate` hashes it — so a test can seed a row `authenticate` will actually match. */
export const hashFor = (secret: string): Promise<string> => Effect.runPromise(sha256Hex(secret));

const opOf = (sql: string): string => {
  const match = /^-- accounts:(\S+)/.exec(sql);
  if (match === null) {
    throw new Error(`fake Database: statement is missing its "-- accounts:<op>" tag: ${sql}`);
  }
  return match[1];
};

const runQuery = (
  state: FakeState,
  op: string,
  bindings: ReadonlyArray<unknown>,
): ReadonlyArray<unknown> => {
  switch (op) {
    case "findSessionByTokenHash": {
      const [hash] = bindings as [string];
      const row = state.sessions.find((session) => session.tokenHash === hash);
      return row === undefined ? [] : [row];
    }
    case "findPrincipalByApiKeyHash": {
      const [hash] = bindings as [string];
      const row = state.principals.find((principal) => principal.apiKeyHash === hash);
      return row === undefined ? [] : [row];
    }
    case "profileForSession": {
      const [sessionId] = bindings as [string];
      const row = state.sessions.find((session) => session.id === sessionId);
      return row === undefined ? [] : [{ profileId: row.profileId }];
    }
    case "profileForPrincipal": {
      const [principalId] = bindings as [string];
      const row = state.principals.find((principal) => principal.id === principalId);
      return row === undefined ? [] : [{ profileId: row.profileId }];
    }
    case "findProfileRow": {
      const [profileId] = bindings as [string];
      const row = state.profiles.find((profile) => profile.profileId === profileId);
      return row === undefined ? [] : [row];
    }
    case "findAnswer": {
      const [profileId, question] = bindings as [string, string];
      const row = state.answers.find(
        (answer) => answer.profileId === profileId && answer.question === question,
      );
      return row === undefined ? [] : [row];
    }
    case "listAnswers": {
      const [profileId] = bindings as [string];
      return state.answers.filter((answer) => answer.profileId === profileId);
    }
    case "answeredQuestions": {
      const [profileId] = bindings as [string];
      const questions = new Set(
        state.answers
          .filter((answer) => answer.profileId === profileId)
          .map((answer) => answer.question),
      );
      return [...questions].map((question) => ({ question }));
    }
    default:
      throw new Error(`fake Database: unhandled query op "${op}"`);
  }
};

const runCommand = (state: FakeState, op: string, bindings: ReadonlyArray<unknown>): void => {
  switch (op) {
    case "insertProfile": {
      const [
        profileId,
        headline,
        summary,
        location,
        languages,
        skills,
        experience,
        education,
        erasure,
        updatedAt,
      ] = bindings as [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
      ];
      state.profiles.push({
        profileId,
        headline,
        summary,
        location,
        languages,
        skills,
        experience,
        education,
        erasure,
        updatedAt,
      });
      return;
    }
    case "updateProfile": {
      const [
        headline,
        summary,
        location,
        languages,
        skills,
        experience,
        education,
        erasure,
        updatedAt,
        profileId,
      ] = bindings as [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
      ];
      const index = state.profiles.findIndex((profile) => profile.profileId === profileId);
      if (index === -1)
        throw new Error(`fake Database: updateProfile with no existing row for ${profileId}`);
      state.profiles[index] = {
        profileId,
        headline,
        summary,
        location,
        languages,
        skills,
        experience,
        education,
        erasure,
        updatedAt,
      };
      return;
    }
    case "insertAnswer": {
      const [profileId, question, label, shape, value, origin, createdAt, updatedAt] = bindings as [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
      ];
      state.answers.push({
        profileId,
        question,
        label,
        shape,
        value,
        origin,
        createdAt,
        updatedAt,
      });
      return;
    }
    case "updateAnswer": {
      const [value, updatedAt, profileId, question] = bindings as [string, string, string, string];
      const index = state.answers.findIndex(
        (answer) => answer.profileId === profileId && answer.question === question,
      );
      if (index === -1) {
        throw new Error(
          `fake Database: updateAnswer with no existing row for ${profileId}/${question}`,
        );
      }
      const existing = state.answers[index];
      if (existing === undefined) throw new Error("unreachable: index came from findIndex");
      state.answers[index] = { ...existing, value, updatedAt };
      return;
    }
    default:
      throw new Error(`fake Database: unhandled run op "${op}"`);
  }
};

export const fakeDatabaseLayer = (state: FakeState): Layer.Layer<Database> =>
  Layer.succeed(Database, {
    query: <A>(sql: string, bindings: ReadonlyArray<unknown>) =>
      Effect.sync(() => runQuery(state, opOf(sql), bindings) as ReadonlyArray<A>),
    run: (sql: string, bindings: ReadonlyArray<unknown>) =>
      Effect.sync(() => runCommand(state, opOf(sql), bindings)),
    // The fake has no rollback story; every test that needs transactional
    // atomicity is exercised against the real Database in the persistence
    // slot's own tests, not here.
    transaction: (effect) => effect,
  });
