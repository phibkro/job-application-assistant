import * as Effect from "effect/Effect";
import { Freshness } from "@job-index/domain/Freshness";
import type { ProfileId } from "@job-index/domain/Ids";
import { Database } from "../../services/Database.ts";
import type { Write } from "../../services/Database.ts";
import { columnsOf, decodeRow, deleteStatement, encodeVariant, insertStatement } from "../Sql.ts";

const TABLE = "freshness";

/**
 * One high-water mark per profile ("Freshness.ts": "held per profile rather
 * than per search"). `db/schema.sql` now declares `PRIMARY KEY (profileId)`,
 * so a second row is rejected by the table rather than merely avoided here;
 * `upsert` still deletes then inserts, as one batch, because that is how it
 * replaces a mark without needing to know whether one exists.
 */
export const upsert = (freshness: Freshness): Effect.Effect<void, never, Database> =>
  Effect.gen(function* () {
    const db = yield* Database;
    const encoded = yield* encodeVariant<Freshness>(Freshness as never)(freshness);
    const removal = deleteStatement(TABLE, { profileId: encoded.profileId as string });
    const insertion = insertStatement(TABLE, columnsOf(Freshness as never), encoded);
    yield* db.atomic([removal, insertion]);
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

/**
 * Erasure support. A purged profile has no further use for its high-water
 * mark, and the row is scoped to `profileId` by its own primary key —
 * erasing it is unambiguous, not a judgement call the way `Submissions`'
 * and `Judgements`' history was.
 */
export const deleteByProfileWrite = (profileId: ProfileId): Write =>
  deleteStatement(TABLE, { profileId });
