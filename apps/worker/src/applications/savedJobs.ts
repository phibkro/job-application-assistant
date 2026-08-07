import * as Effect from "effect/Effect";
import { SavedJob } from "@job-index/domain/Applications";
import type { SavedJobId } from "@job-index/domain/Ids";
import { Database } from "../services/Database.ts";
import { columnsOf, decodeRow, encodeVariant, insertStatement } from "../db/Sql.ts";

/**
 * The bookmark `Applications.prepare`'s `savedJob: SavedJobId` argument
 * refers to. No table backed this anywhere in the schema before this slot —
 * see the report — so `insert` exists here only to make this repository
 * testable end to end; the real write path (a `save` endpoint) belongs to
 * whichever slot owns that part of the wire contract.
 */
const TABLE = "saved_jobs";

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
