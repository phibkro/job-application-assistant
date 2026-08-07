import * as Effect from "effect/Effect";
import { Answer } from "@job-index/domain/Answer";
import type { ProfileId } from "@job-index/domain/Ids";
import type { QuestionKey } from "@job-index/domain/Answer";
import { Database } from "../../services/Database.ts";
import { columnsOf, decodeRows, deleteStatement, encodeVariant, insertStatement } from "../Sql.ts";

const TABLE = "answers";

/**
 * `answers` is keyed by `(profileId, question)` in the domain
 * (`Answer.ts`'s docstring: "reusable across every application"), but
 * `db/schema.sql` — generated from the model, which has no way to declare a
 * key — carries no `PRIMARY KEY`/`UNIQUE` constraint on those columns.
 * `upsert` compensates for that gap here, application-side, rather than
 * relying on a constraint that does not exist: delete any existing row for
 * the key, then insert the new one, both inside one `Database.transaction`
 * so a reader never observes the key briefly missing.
 */
export const upsert = (answer: Answer): Effect.Effect<void, never, Database> =>
  Effect.gen(function* () {
    const db = yield* Database;
    const encoded = yield* encodeVariant<Answer>(Answer as never)(answer);
    yield* db.transaction(
      Effect.gen(function* () {
        const del = deleteStatement(TABLE, {
          profileId: encoded.profileId as string,
          question: encoded.question as string,
        });
        yield* db.run(del.sql, del.bindings);
        const ins = insertStatement(TABLE, columnsOf(Answer as never), encoded);
        yield* db.run(ins.sql, ins.bindings);
      }),
    );
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
export const deleteByProfile = (profileId: ProfileId): Effect.Effect<void, never, Database> =>
  Effect.gen(function* () {
    const db = yield* Database;
    const stmt = deleteStatement(TABLE, { profileId });
    yield* db.run(stmt.sql, stmt.bindings);
  });
