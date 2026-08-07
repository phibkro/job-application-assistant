import * as Effect from "effect/Effect";
import { Subscription } from "@job-index/domain/Subscription";
import type { ProfileId } from "@job-index/domain/Ids";
import { Database } from "../../services/Database.ts";
import type { Write } from "../../services/Database.ts";
import { columnsOf, decodeRow, deleteStatement, encodeVariant, insertStatement } from "../Sql.ts";

const TABLE = "subscriptions";

/**
 * One entitlement record per profile, now enforced by `PRIMARY KEY
 * (profileId)` in the generated schema rather than by this function alone.
 * `upsert` still deletes then inserts, as one batch: it replaces a row
 * without first asking whether one exists.
 */
export const upsert = (subscription: Subscription): Effect.Effect<void, never, Database> =>
  Effect.gen(function* () {
    const db = yield* Database;
    const encoded = yield* encodeVariant<Subscription>(Subscription as never)(subscription);
    yield* db.atomic([
      deleteStatement(TABLE, { profileId: encoded.profileId as string }),
      insertStatement(TABLE, columnsOf(Subscription as never), encoded),
    ]);
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

/**
 * Erasure support. `providerRef` is `Model.Sensitive` — a billing-provider
 * (Stripe) reference — which is exactly the kind of field this erasure
 * right exists for. Erasing our row does not touch the provider's own
 * billing/tax records, which are the provider's system of record under its
 * own retention obligations; this table is only our pointer into it.
 */
export const deleteByProfileWrite = (profileId: ProfileId): Write =>
  deleteStatement(TABLE, { profileId });
