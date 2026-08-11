import * as Effect from "effect/Effect";
import { ActiveApplication } from "@job-index/domain/Applications";
import type { ApplicationId, ProfileId, SavedJobId } from "@job-index/domain/Ids";
import { Database } from "../services/Database.ts";
import type { Write } from "../services/Database.ts";
import { columnsOf, decodeRow, encodeVariant, insertStatement } from "../db/Sql.ts";

const TABLE = "active_applications";

const variant = (ActiveApplication as never as { insert: object }).insert as never;
const columns = columnsOf(variant);

export const insertWrite = (relation: ActiveApplication): Effect.Effect<Write> =>
  Effect.map(encodeVariant<ActiveApplication>(variant)(relation), (encoded) =>
    insertStatement(TABLE, columns, encoded),
  );

/** Replace the saved vacancy's active pointer without touching prior attempts. */
export const upsertWrite = (relation: ActiveApplication): Effect.Effect<Write> =>
  Effect.map(encodeVariant<ActiveApplication>(variant)(relation), (encoded) => ({
    sql:
      `INSERT INTO ${TABLE} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")}) ` +
      "ON CONFLICT (savedJobId) DO UPDATE SET profileId = excluded.profileId, " +
      "applicationId = excluded.applicationId, updatedAt = excluded.updatedAt",
    bindings: columns.map((column) => encoded[column]),
  }));

export const findBySavedJobForProfile = (
  savedJobId: SavedJobId,
  profileId: ProfileId,
): Effect.Effect<ActiveApplication | undefined, never, Database> =>
  Effect.gen(function* () {
    const db = yield* Database;
    const rows = yield* db.query<unknown>(
      `SELECT * FROM ${TABLE} WHERE savedJobId = ? AND profileId = ?`,
      [savedJobId, profileId],
    );
    return rows[0] === undefined
      ? undefined
      : yield* decodeRow<ActiveApplication>(ActiveApplication as never)(rows[0]);
  });

export const findByApplicationForProfile = (
  applicationId: ApplicationId,
  profileId: ProfileId,
): Effect.Effect<ActiveApplication | undefined, never, Database> =>
  Effect.gen(function* () {
    const db = yield* Database;
    const rows = yield* db.query<unknown>(
      `SELECT * FROM ${TABLE} WHERE applicationId = ? AND profileId = ?`,
      [applicationId, profileId],
    );
    return rows[0] === undefined
      ? undefined
      : yield* decodeRow<ActiveApplication>(ActiveApplication as never)(rows[0]);
  });

export const deleteByProfileWrite = (profileId: ProfileId): Write => ({
  sql: `DELETE FROM ${TABLE} WHERE profileId = ?`,
  bindings: [profileId],
});
