import * as Effect from "effect/Effect";
import { ApplicationRecord } from "@job-index/domain/Applications";
import type { ApplicationMethod, ApplicationStatus } from "@job-index/domain/Applications";
import type { ApplicationId, ProfileId, SavedJobId } from "@job-index/domain/Ids";
import { Database } from "../services/Database.ts";
import type { Write } from "../services/Database.ts";
import {
  columnsOf,
  decodeRow,
  decodeRows,
  deleteStatement,
  encodeVariant,
  insertStatement,
  updateStatement,
} from "../db/Sql.ts";
const TABLE = "applications";

/** The non-sensitive fields shown by the saved-vacancy history endpoint. */
export interface SavedApplicationHistoryRow {
  readonly applicationId: ApplicationId;
  readonly status: ApplicationStatus;
  readonly method: ApplicationMethod;
  readonly applicationUrl: string;
  readonly notes: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly isCurrent: number;
}

const KEY = ["id"];

export const insertWrite = (application: ApplicationRecord): Effect.Effect<Write> =>
  Effect.gen(function* () {
    const variant = (ApplicationRecord as never as { insert: object }).insert as never;
    const encoded = yield* encodeVariant<ApplicationRecord>(variant)(application);
    return insertStatement(TABLE, columnsOf(variant), encoded);
  });

export const insert = (application: ApplicationRecord): Effect.Effect<void, never, Database> =>
  Effect.gen(function* () {
    const db = yield* Database;
    const stmt = yield* insertWrite(application);
    yield* db.run(stmt.sql, stmt.bindings);
  });

export const update = (application: ApplicationRecord): Effect.Effect<void, never, Database> =>
  Effect.gen(function* () {
    const db = yield* Database;
    const variant = (ApplicationRecord as never as { update: object }).update as never;
    const encoded = yield* encodeVariant<ApplicationRecord>(variant)(application);
    const stmt = updateStatement(TABLE, columnsOf(variant), KEY, encoded);
    yield* db.run(stmt.sql, stmt.bindings);
  });
/**
 * Compare-and-swap the current attempt while checking its owner and version.
 * A zero result means another writer advanced the row after the caller read it.
 */
export const updateIfUnchanged = (
  application: ApplicationRecord,
  expectedUpdatedAt: string,
): Effect.Effect<number, never, Database> =>
  Effect.gen(function* () {
    const db = yield* Database;
    const variant = (ApplicationRecord as never as { update: object }).update as never;
    const encoded = yield* encodeVariant<ApplicationRecord>(variant)(application);
    const columns = columnsOf(variant).filter(
      (column) => column !== "id" && column !== "profileId",
    );
    const assignments = columns.map((column) => `${column} = ?`).join(", ");
    const bindings = [
      ...columns.map((column) => encoded[column]),
      encoded.id,
      encoded.profileId,
      expectedUpdatedAt,
    ];
    return yield* db.runAffected(
      `UPDATE ${TABLE} SET ${assignments} WHERE id = ? AND profileId = ? AND updatedAt = ?`,
      bindings,
    );
  });

/**
 * Scoped to `profileId` in the query itself, not merely by convention: a
 * caller cannot accidentally fetch — or later update — an application that
 * belongs to someone else.
 */
export const findByIdForProfile = (
  id: ApplicationId,
  profileId: ProfileId,
): Effect.Effect<ApplicationRecord | undefined, never, Database> =>
  Effect.gen(function* () {
    const db = yield* Database;
    const rows = yield* db.query<unknown>(`SELECT * FROM ${TABLE} WHERE id = ? AND profileId = ?`, [
      id,
      profileId,
    ]);
    return rows[0] === undefined
      ? undefined
      : yield* decodeRow<ApplicationRecord>(ApplicationRecord as never)(rows[0]);
  });

/** Every application a profile has prepared, newest first — the read behind `Applications.history` and its export. */
export const findByProfile = (
  profileId: ProfileId,
): Effect.Effect<ReadonlyArray<ApplicationRecord>, never, Database> =>
  Effect.gen(function* () {
    const db = yield* Database;
    const rows = yield* db.query<unknown>(
      `SELECT * FROM ${TABLE} WHERE profileId = ? ORDER BY createdAt DESC`,
      [profileId],
    );
    return yield* decodeRows<ApplicationRecord>(ApplicationRecord as never)(rows);
  });

export const findHistoryForSaved = (
  profileId: ProfileId,
  savedJobId: SavedJobId,
): Effect.Effect<ReadonlyArray<SavedApplicationHistoryRow>, never, Database> =>
  Effect.gen(function* () {
    const db = yield* Database;
    return yield* db.query<SavedApplicationHistoryRow>(
      `SELECT
         a.id AS applicationId,
         a.status,
         a.method,
         a.applicationUrl,
         a.notes,
         a.createdAt,
         a.updatedAt,
         CASE WHEN aa.applicationId IS NULL THEN 0 ELSE 1 END AS isCurrent
       FROM ${TABLE} a
       LEFT JOIN active_applications aa
         ON aa.profileId = a.profileId
        AND aa.savedJobId = a.savedJobId
        AND aa.applicationId = a.id
       WHERE a.profileId = ? AND a.savedJobId = ?
       ORDER BY a.createdAt DESC, a.id DESC`,
      [profileId, savedJobId],
    );
  });

/** Erasure support: every application belonging to a profile, in one statement. */
/**
 * The statement, not its execution, so a caller that must erase several
 * tables together can batch them. The table name stays in the repository
 * that owns it.
 */
export const deleteByProfileWrite = (profileId: ProfileId): Write =>
  deleteStatement(TABLE, { profileId });
