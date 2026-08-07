import * as Effect from "effect/Effect";
import { ApplicationRecord } from "@job-index/domain/Applications";
import type { ApplicationId, ProfileId } from "@job-index/domain/Ids";
import { Database } from "../services/Database.ts";
import {
  columnsOf,
  decodeRow,
  encodeVariant,
  insertStatement,
  updateStatement,
} from "../db/Sql.ts";

/** `Applications`' own state: what `prepare` produced and `setStatus` moves through its lifecycle. */
const TABLE = "applications";
const KEY = ["id"];

export const insert = (application: ApplicationRecord): Effect.Effect<void, never, Database> =>
  Effect.gen(function* () {
    const db = yield* Database;
    const variant = (ApplicationRecord as never as { insert: object }).insert as never;
    const encoded = yield* encodeVariant<ApplicationRecord>(variant)(application);
    const stmt = insertStatement(TABLE, columnsOf(variant), encoded);
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
