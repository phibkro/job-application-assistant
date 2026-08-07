import * as Effect from "effect/Effect";
import { Freshness } from "@job-index/domain/Freshness";
import type { ProfileId } from "@job-index/domain/Ids";
import { Database } from "../../services/Database.ts";
import { columnsOf, decodeRow, deleteStatement, encodeVariant, insertStatement } from "../Sql.ts";

const TABLE = "freshness";

/**
 * One high-water mark per profile ("Freshness.ts": "held per profile rather
 * than per search"), but `db/schema.sql` declares no `PRIMARY KEY`/`UNIQUE`
 * on `profileId` — the model has no way to express that constraint, so the
 * generated snapshot doesn't either. `upsert` enforces "at most one row per
 * profile" the way `Answers.upsert` does: delete then insert, inside one
 * transaction.
 */
export const upsert = (freshness: Freshness): Effect.Effect<void, never, Database> =>
  Effect.gen(function* () {
    const db = yield* Database;
    const encoded = yield* encodeVariant<Freshness>(Freshness as never)(freshness);
    yield* db.transaction(
      Effect.gen(function* () {
        const del = deleteStatement(TABLE, { profileId: encoded.profileId as string });
        yield* db.run(del.sql, del.bindings);
        const ins = insertStatement(TABLE, columnsOf(Freshness as never), encoded);
        yield* db.run(ins.sql, ins.bindings);
      }),
    );
  });

export const findByProfile = (
  profileId: ProfileId,
): Effect.Effect<Freshness | undefined, never, Database> =>
  Effect.gen(function* () {
    const db = yield* Database;
    const rows = yield* db.query<unknown>(`SELECT * FROM ${TABLE} WHERE profileId = ?`, [
      profileId,
    ]);
    return rows[0] === undefined
      ? undefined
      : yield* decodeRow<Freshness>(Freshness as never)(rows[0]);
  });
