import * as Effect from "effect/Effect";
import { Judgement } from "@job-index/domain/Freshness";
import type { CanonicalJobId, ProfileId } from "@job-index/domain/Ids";
import { Database } from "../../services/Database.ts";
import { columnsOf, decodeRows, encodeVariant, insertStatement } from "../Sql.ts";

const TABLE = "judgements";

/**
 * Append-only, like `Submissions`: `Freshness.ts`'s docstring frames a
 * judgement as an event ("worth feeding back into what gets surfaced
 * next"), the table has `createdAt` but no `updatedAt`, and repeated
 * judgements on the same job are meaningful history (a person can change
 * their mind), not a row to overwrite — so no key is enforced here the way
 * `Answers`/`Freshness` enforce one.
 */
export const record = (judgement: Judgement): Effect.Effect<void, never, Database> =>
  Effect.gen(function* () {
    const db = yield* Database;
    const encoded = yield* encodeVariant<Judgement>(Judgement as never)(judgement);
    const stmt = insertStatement(TABLE, columnsOf(Judgement as never), encoded);
    yield* db.run(stmt.sql, stmt.bindings);
  });

export const findByProfile = (
  profileId: ProfileId,
): Effect.Effect<ReadonlyArray<Judgement>, never, Database> =>
  Effect.gen(function* () {
    const db = yield* Database;
    const rows = yield* db.query<unknown>(
      `SELECT * FROM ${TABLE} WHERE profileId = ? ORDER BY createdAt DESC`,
      [profileId],
    );
    return yield* decodeRows<Judgement>(Judgement as never)(rows);
  });

export const findByJob = (
  profileId: ProfileId,
  jobId: CanonicalJobId,
): Effect.Effect<ReadonlyArray<Judgement>, never, Database> =>
  Effect.gen(function* () {
    const db = yield* Database;
    const rows = yield* db.query<unknown>(
      `SELECT * FROM ${TABLE} WHERE profileId = ? AND jobId = ? ORDER BY createdAt DESC`,
      [profileId, jobId],
    );
    return yield* decodeRows<Judgement>(Judgement as never)(rows);
  });
