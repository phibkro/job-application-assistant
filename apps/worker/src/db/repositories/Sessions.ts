import * as Effect from "effect/Effect";
import { Session } from "@job-index/domain/Access";
import type { ProfileId } from "@job-index/domain/Ids";
import { Database } from "../../services/Database.ts";
import {
  columnsOf,
  decodeRow,
  decodeRows,
  deleteStatement,
  encodeVariant,
  insertStatement,
  updateStatement,
} from "../Sql.ts";

const TABLE = "sessions";
const KEY = ["id"];

export const insert = (session: Session): Effect.Effect<void, never, Database> =>
  Effect.gen(function* () {
    const db = yield* Database;
    const variant = (Session as never as { insert: object }).insert as never;
    const encoded = yield* encodeVariant<Session>(variant)(session);
    const stmt = insertStatement(TABLE, columnsOf(variant), encoded);
    yield* db.run(stmt.sql, stmt.bindings);
  });

/**
 * Revocation is the one mutation a session ever gets — "possession of the
 * row must not grant access" once revoked (`Access.ts`'s docstring) — but
 * the schema-derived `update` variant covers the whole row, not just
 * `revokedAt`. Callers pass the full instance (with `revokedAt` already set)
 * rather than this repository inventing a narrower statement that would
 * restate a column list the model already owns.
 */
export const update = (session: Session): Effect.Effect<void, never, Database> =>
  Effect.gen(function* () {
    const db = yield* Database;
    const variant = (Session as never as { update: object }).update as never;
    const encoded = yield* encodeVariant<Session>(variant)(session);
    const stmt = updateStatement(TABLE, columnsOf(variant), KEY, encoded);
    yield* db.run(stmt.sql, stmt.bindings);
  });

export const findById = (id: string): Effect.Effect<Session | undefined, never, Database> =>
  Effect.gen(function* () {
    const db = yield* Database;
    const rows = yield* db.query<unknown>(`SELECT * FROM ${TABLE} WHERE id = ?`, [id]);
    return rows[0] === undefined ? undefined : yield* decodeRow<Session>(Session as never)(rows[0]);
  });

export const findByProfile = (
  profileId: ProfileId,
): Effect.Effect<ReadonlyArray<Session>, never, Database> =>
  Effect.gen(function* () {
    const db = yield* Database;
    const rows = yield* db.query<unknown>(`SELECT * FROM ${TABLE} WHERE profileId = ?`, [
      profileId,
    ]);
    return yield* decodeRows<Session>(Session as never)(rows);
  });

/** Erasure support. */
export const deleteByProfile = (profileId: ProfileId): Effect.Effect<void, never, Database> =>
  Effect.gen(function* () {
    const db = yield* Database;
    const stmt = deleteStatement(TABLE, { profileId });
    yield* db.run(stmt.sql, stmt.bindings);
  });
