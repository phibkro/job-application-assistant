import * as Effect from "effect/Effect";
import { SavedJob } from "@job-index/domain/Applications";
import type { CanonicalJobId, ProfileId, SavedJobId } from "@job-index/domain/Ids";
import { Database } from "../services/Database.ts";
import type { Write } from "../services/Database.ts";
import {
  columnsOf,
  decodeRow,
  decodeRows,
  deleteStatement,
  encodeVariant,
  insertStatement,
} from "../db/Sql.ts";

/**
 * The bookmark `Applications.prepare`'s `savedJob: SavedJobId` argument
 * refers to. No table backed this anywhere in the schema before this slot —
 * see the report — so `insert` exists here only to make this repository
 * testable end to end; the real write path (a `save` endpoint) belongs to
 * whichever slot owns that part of the wire contract.
 */
const TABLE = "saved_jobs";

export const upsertWrite = (job: SavedJob): Effect.Effect<Write, never, Database> =>
  Effect.gen(function* () {
    const variant = (SavedJob as never as { insert: object }).insert as never;
    const encoded = yield* encodeVariant<SavedJob>(variant)(job);
    const columns = columnsOf(variant);
    return {
      sql:
        `INSERT INTO ${TABLE} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")}) ` +
        "ON CONFLICT (profileId, canonicalJobId) DO UPDATE SET " +
        "jobSnapshot = excluded.jobSnapshot, note = excluded.note, updatedAt = excluded.updatedAt",
      bindings: columns.map((column) => encoded[column]),
    };
  });

export const insert = (job: SavedJob): Effect.Effect<void, never, Database> =>
  Effect.gen(function* () {
    const db = yield* Database;
    const variant = (SavedJob as never as { insert: object }).insert as never;
    const encoded = yield* encodeVariant<SavedJob>(variant)(job);
    const stmt = insertStatement(TABLE, columnsOf(variant), encoded);
    yield* db.run(stmt.sql, stmt.bindings);
  });

export const findById = (id: SavedJobId): Effect.Effect<SavedJob | undefined, never, Database> =>
  Effect.gen(function* () {
    const db = yield* Database;
    const rows = yield* db.query<unknown>(`SELECT * FROM ${TABLE} WHERE id = ?`, [id]);
    return rows[0] === undefined
      ? undefined
      : yield* decodeRow<SavedJob>(SavedJob as never)(rows[0]);
  });

export const findByProfileCanonical = (
  profileId: ProfileId,
  canonicalJobId: CanonicalJobId,
): Effect.Effect<SavedJob | undefined, never, Database> =>
  Effect.gen(function* () {
    const db = yield* Database;
    const rows = yield* db.query<unknown>(
      `SELECT * FROM ${TABLE} WHERE profileId = ? AND canonicalJobId = ?`,
      [profileId, canonicalJobId],
    );
    return rows[0] === undefined
      ? undefined
      : yield* decodeRow<SavedJob>(SavedJob as never)(rows[0]);
  });

export const findByIdForProfile = (
  id: SavedJobId,
  profileId: ProfileId,
): Effect.Effect<SavedJob | undefined, never, Database> =>
  Effect.gen(function* () {
    const db = yield* Database;
    const rows = yield* db.query<unknown>(`SELECT * FROM ${TABLE} WHERE id = ? AND profileId = ?`, [
      id,
      profileId,
    ]);
    return rows[0] === undefined
      ? undefined
      : yield* decodeRow<SavedJob>(SavedJob as never)(rows[0]);
  });

/** Every saved job a profile has, newest first — the read behind `SavedJobs.list` and its export. */
export const findByProfile = (
  profileId: ProfileId,
): Effect.Effect<ReadonlyArray<SavedJob>, never, Database> =>
  Effect.gen(function* () {
    const db = yield* Database;
    const rows = yield* db.query<unknown>(
      `SELECT * FROM ${TABLE} WHERE profileId = ? ORDER BY createdAt DESC`,
      [profileId],
    );
    return yield* decodeRows<SavedJob>(SavedJob as never)(rows);
  });

/** Erasure support: every saved job belonging to a profile, in one statement. */
/**
 * The statement, not its execution, so a caller that must erase several
 * tables together can batch them. The table name stays in the repository
 * that owns it.
 */
export const deleteByProfileWrite = (profileId: ProfileId): Write =>
  deleteStatement(TABLE, { profileId });
