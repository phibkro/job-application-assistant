import * as Effect from "effect/Effect";
import { Subscription } from "@job-index/domain/Subscription";
import type { ProfileId } from "@job-index/domain/Ids";
import { Database } from "../../services/Database.ts";
import { columnsOf, decodeRow, deleteStatement, encodeVariant, insertStatement } from "../Sql.ts";

const TABLE = "subscriptions";

/**
 * One entitlement record per profile, same gap as `Answers`/`Freshness`:
 * the schema carries no `PRIMARY KEY`/`UNIQUE` on `profileId`, so `upsert`
 * enforces the "one row" invariant with delete-then-insert inside a
 * transaction rather than `ON CONFLICT`, which would need a unique index
 * that does not exist.
 */
export const upsert = (subscription: Subscription): Effect.Effect<void, never, Database> =>
  Effect.gen(function* () {
    const db = yield* Database;
    const encoded = yield* encodeVariant<Subscription>(Subscription as never)(subscription);
    yield* db.transaction(
      Effect.gen(function* () {
        const del = deleteStatement(TABLE, { profileId: encoded.profileId as string });
        yield* db.run(del.sql, del.bindings);
        const ins = insertStatement(TABLE, columnsOf(Subscription as never), encoded);
        yield* db.run(ins.sql, ins.bindings);
      }),
    );
  });

export const findByProfile = (
  profileId: ProfileId,
): Effect.Effect<Subscription | undefined, never, Database> =>
  Effect.gen(function* () {
    const db = yield* Database;
    const rows = yield* db.query<unknown>(`SELECT * FROM ${TABLE} WHERE profileId = ?`, [
      profileId,
    ]);
    return rows[0] === undefined
      ? undefined
      : yield* decodeRow<Subscription>(Subscription as never)(rows[0]);
  });
