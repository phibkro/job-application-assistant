import * as Effect from "effect/Effect";
import { PlatformPolicyRecord } from "@job-index/domain/Applications";
import type { PlatformId } from "@job-index/domain/Ids";
import { Database } from "../services/Database.ts";
import {
  columnsOf,
  decodeRow,
  deleteStatement,
  encodeVariant,
  insertStatement,
} from "../db/Sql.ts";

/**
 * `Policy`'s own record of what a platform is researched to permit. Absence
 * of a row — not a row here — is how `Unreviewed` is represented: a platform
 * nobody has read the terms of has nothing recorded, rather than a row
 * someone had to remember to insert as `Unreviewed`.
 */
const TABLE = "platform_policies";

export const upsert = (record: PlatformPolicyRecord): Effect.Effect<void, never, Database> =>
  Effect.gen(function* () {
    const db = yield* Database;
    const variant = (PlatformPolicyRecord as never as { insert: object }).insert as never;
    const encoded = yield* encodeVariant<PlatformPolicyRecord>(variant)(record);
    yield* db.atomic([
      deleteStatement(TABLE, { platformId: encoded.platformId as string }),
      insertStatement(TABLE, columnsOf(variant), encoded),
    ]);
  });

export const findById = (
  platformId: PlatformId,
): Effect.Effect<PlatformPolicyRecord | undefined, never, Database> =>
  Effect.gen(function* () {
    const db = yield* Database;
    const rows = yield* db.query<unknown>(`SELECT * FROM ${TABLE} WHERE platformId = ?`, [
      platformId,
    ]);
    return rows[0] === undefined
      ? undefined
      : yield* decodeRow<PlatformPolicyRecord>(PlatformPolicyRecord as never)(rows[0]);
  });
