import * as Effect from "effect/Effect";
import { Judgement } from "@job-index/domain/Freshness";
import type { CanonicalJobId, ProfileId } from "@job-index/domain/Ids";
import { Database } from "../../services/Database.ts";
import type { Write } from "../../services/Database.ts";
import { columnsOf, decodeRows, deleteStatement, encodeVariant, insertStatement } from "../Sql.ts";

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

/**
 * Erasure support. `Judgement.reason` is `Model.Sensitive` free text a
 * person typed — squarely the kind of thing the erasure right is about —
 * and every row is scoped to `profileId`. The same reasoning `Submissions`
 * gives applies here: "feeds match-tuning" is an argument for an anonymised,
 * aggregate signal this slot does not build, not for keeping the identified
 * row past an erasure request.
 */
export const deleteByProfileWrite = (profileId: ProfileId): Write =>
  deleteStatement(TABLE, { profileId });

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
