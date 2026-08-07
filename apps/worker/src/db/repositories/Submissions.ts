import * as Effect from "effect/Effect";
import { Submission } from "@job-index/domain/Delivery";
import type { ProfileId, SubmissionId } from "@job-index/domain/Ids";
import { Database } from "../../services/Database.ts";
import { columnsOf, decodeRow, decodeRows, encodeVariant, insertStatement } from "../Sql.ts";

const TABLE = "submissions";

/**
 * Insert-only, deliberately: `Delivery.ts`'s docstring calls a submission
 * "one attempt to deliver one application", and the generated schema has no
 * `updatedAt` column for this table — the model itself never declared one.
 * Mutating an attempt after the fact would corrupt the history "whether a
 * platform is ready to be promoted from agent to scripted" is read from, so
 * this repository exposes no `update`.
 */
export const insert = (submission: Submission): Effect.Effect<void, never, Database> =>
  Effect.gen(function* () {
    const db = yield* Database;
    const encoded = yield* encodeVariant<Submission>(
      (Submission as never as { insert: object }).insert as never,
    )(submission);
    const stmt = insertStatement(
      TABLE,
      columnsOf((Submission as never as { insert: object }).insert as never),
      encoded,
    );
    yield* db.run(stmt.sql, stmt.bindings);
  });

export const findById = (
  id: SubmissionId,
): Effect.Effect<Submission | undefined, never, Database> =>
  Effect.gen(function* () {
    const db = yield* Database;
    const rows = yield* db.query<unknown>(`SELECT * FROM ${TABLE} WHERE id = ?`, [id]);
    return rows[0] === undefined
      ? undefined
      : yield* decodeRow<Submission>(Submission as never)(rows[0]);
  });

export const findByProfile = (
  profileId: ProfileId,
): Effect.Effect<ReadonlyArray<Submission>, never, Database> =>
  Effect.gen(function* () {
    const db = yield* Database;
    const rows = yield* db.query<unknown>(
      `SELECT * FROM ${TABLE} WHERE profileId = ? ORDER BY createdAt DESC`,
      [profileId],
    );
    return yield* decodeRows<Submission>(Submission as never)(rows);
  });
