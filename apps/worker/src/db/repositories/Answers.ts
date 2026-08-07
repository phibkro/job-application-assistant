import * as Effect from "effect/Effect";
import { Answer } from "@job-index/domain/Answer";
import type { ProfileId } from "@job-index/domain/Ids";
import type { QuestionKey } from "@job-index/domain/Answer";
import { Database } from "../../services/Database.ts";
import type { Write } from "../../services/Database.ts";
import { columnsOf, decodeRows, deleteStatement, encodeVariant, insertStatement } from "../Sql.ts";

const TABLE = "answers";

/**
 * `answers` is keyed by `(profileId, question)` in the domain
 * (`Answer.ts`'s docstring: "reusable across every application"), and
 * `db/schema.sql` now declares that key — the gap this slot reported, where
 * the generated snapshot carried no constraint at all, is closed. `upsert`
 * deletes then inserts because that replaces a row without first asking
 * whether one exists; the pair travels as one batch, so a reader never
 * observes the key briefly missing.
 */
export const upsert = (answer: Answer): Effect.Effect<void, never, Database> =>
  Effect.gen(function* () {
    const db = yield* Database;
    const encoded = yield* encodeVariant<Answer>(Answer as never)(answer);
    // Delete then insert, as one batch: "at most one answer per question"
    // is enforced by the pair arriving together, never by the gap between them.
    const removal = deleteStatement(TABLE, {
      profileId: encoded.profileId as string,
      question: encoded.question as string,
    });
    const insertion = insertStatement(TABLE, columnsOf(Answer as never), encoded);
    yield* db.atomic([removal, insertion]);
  });

export const findByProfile = (
  profileId: ProfileId,
): Effect.Effect<ReadonlyArray<Answer>, never, Database> =>
  Effect.gen(function* () {
    const db = yield* Database;
    const rows = yield* db.query<unknown>(`SELECT * FROM ${TABLE} WHERE profileId = ?`, [
      profileId,
    ]);
    return yield* decodeRows<Answer>(Answer as never)(rows);
  });

export const findOne = (
  profileId: ProfileId,
  question: QuestionKey,
): Effect.Effect<Answer | undefined, never, Database> =>
  Effect.gen(function* () {
    const db = yield* Database;
    const rows = yield* db.query<unknown>(
      `SELECT * FROM ${TABLE} WHERE profileId = ? AND question = ?`,
      [profileId, question],
    );
    const decoded = yield* decodeRows<Answer>(Answer as never)(rows);
    return decoded[0];
  });

/** Erasure support: every answer belonging to a profile, in one statement. */
/**
 * The statement, not its execution, so a caller that must erase several
 * tables together can batch them. The table name stays in the repository
 * that owns it.
 */
export const deleteByProfileWrite = (profileId: ProfileId): Write =>
  deleteStatement(TABLE, { profileId });

export const deleteByProfile = (profileId: ProfileId): Effect.Effect<void, never, Database> =>
  Effect.gen(function* () {
    const db = yield* Database;
    const stmt = deleteByProfileWrite(profileId);
    yield* db.run(stmt.sql, stmt.bindings);
  });
