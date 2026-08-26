import * as Effect from "effect/Effect";
import { StudioDocument } from "@job-index/domain/Documents";
import type { ProfileId, DocumentId } from "@job-index/domain/Ids";
import { Database } from "../../services/Database.ts";
import type { Write } from "../../services/Database.ts";
import {
  columnsOf,
  decodeRow,
  decodeRows,
  deleteStatement,
  encodeVariant,
  insertStatement,
} from "../Sql.ts";

const TABLE = "documents";
/** Fixed page size for owner listings — echoed in every page's `meta` (the saved-listing precedent). */
export const PAGE_LIMIT = 50;

/**
 * The studio document store (WS-0018). One row per drafted document, always
 * written and read through an owner predicate: every lookup here takes the
 * `profileId`, so another account's id is indistinguishable from a missing
 * one at this layer — the routes' 404s are structural, not checked afterwards.
 *
 * Mutations after insert are exactly two: a content edit (`updateContent`)
 * and deletion. Regeneration does not live here — it creates a new row via
 * `insert`, so older versions survive until the owner deletes them.
 */
export const insert = (document: StudioDocument): Effect.Effect<void, never, Database> =>
  Effect.gen(function* () {
    const db = yield* Database;
    const encoded = yield* encodeVariant(StudioDocument)(document);
    const stmt = insertStatement(TABLE, columnsOf(StudioDocument), encoded);
    yield* db.run(stmt.sql, stmt.bindings);
  });

export const findByIdForProfile = (
  id: DocumentId,
  profileId: ProfileId,
): Effect.Effect<StudioDocument | undefined, never, Database> =>
  Effect.gen(function* () {
    const db = yield* Database;
    const rows = yield* db.query<unknown>(`SELECT * FROM ${TABLE} WHERE id = ? AND profileId = ?`, [
      id,
      profileId,
    ]);
    return rows[0] === undefined
      ? undefined
      : yield* decodeRow<StudioDocument>(StudioDocument)(rows[0]);
  });

/** Newest first; paged with the fixed limit + opaque offset cursor. */
export const findByProfilePage = (
  profileId: ProfileId,
  cursor: number,
): Effect.Effect<
  { readonly data: ReadonlyArray<StudioDocument>; readonly nextCursor: string | null },
  never,
  Database
> =>
  Effect.gen(function* () {
    const db = yield* Database;
    const rows = yield* decodeRows<StudioDocument>(StudioDocument)(
      yield* db.query<unknown>(
        `SELECT * FROM ${TABLE} WHERE profileId = ? ORDER BY createdAt DESC`,
        [profileId],
      ),
    );
    const page = rows.slice(cursor, cursor + PAGE_LIMIT);
    return {
      data: page,
      nextCursor: cursor + PAGE_LIMIT < rows.length ? String(cursor + PAGE_LIMIT) : null,
    };
  });

/**
 * Overwrites the content of exactly one owner-scoped row. Returns the
 * affected count — `0` means unknown id or another principal's, which the
 * handler maps to `NotFound`; there is no third meaning.
 */
export const updateContent = (
  id: DocumentId,
  profileId: ProfileId,
  content: string,
  updatedAt: string,
): Effect.Effect<number, never, Database> =>
  Effect.gen(function* () {
    const db = yield* Database;
    return yield* db.runAffected(
      `UPDATE ${TABLE} SET content = ?, updatedAt = ? WHERE id = ? AND profileId = ?`,
      [content, updatedAt, id, profileId],
    );
  });

/** Same count contract as `updateContent`. */
export const deleteByIdForProfile = (
  id: DocumentId,
  profileId: ProfileId,
): Effect.Effect<number, never, Database> =>
  Effect.gen(function* () {
    const db = yield* Database;
    return yield* db.runAffected(`DELETE FROM ${TABLE} WHERE id = ? AND profileId = ?`, [
      id,
      profileId,
    ]);
  });

/**
 * Erasure support. A studio document is owner-authored personal data — the
 * prose the person wrote about their own working life — and goes when the
 * profile goes. Registered in `db/Erase.ts`'s purge list.
 */
export const deleteByProfileWrite = (profileId: ProfileId): Write =>
  deleteStatement(TABLE, { profileId });

/** WS-0019 workspace export: every document of the profile, newest first, uncursored — the export is one complete document. */
export const findByProfile = (
  profileId: ProfileId,
): Effect.Effect<ReadonlyArray<StudioDocument>, never, Database> =>
  Effect.gen(function* () {
    const db = yield* Database;
    return yield* decodeRows<StudioDocument>(StudioDocument)(
      yield* db.query<unknown>(
        `SELECT * FROM ${TABLE} WHERE profileId = ? ORDER BY createdAt DESC, id ASC`,
        [profileId],
      ),
    );
  });
