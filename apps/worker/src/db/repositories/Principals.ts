import * as Effect from "effect/Effect";
import type { ProfileId } from "@job-index/domain/Ids";
import { Database } from "../../services/Database.ts";
import type { Write } from "../../services/Database.ts";

/**
 * The authentication-identity rows (`db/schema.sql`'s `principals`).
 *
 * This table had no repository because nothing in the product wrote it —
 * principals were provisioned out-of-band (see `accounts/live.test.ts`'s
 * seeded-row note). WS-0019's self-service deletion is the first legitimate
 * writer: revoking every principal of an erased profile, in the same atomic
 * batch as the data purge, is what makes "deleted account authenticates as
 * nothing" hold for API keys as well as sessions.
 *
 * Revocation, not deletion: the row survives with `revokedAt` set. The hash
 * is one-way — its presence proves non-authenticity and keeps the UNIQUE
 * constraint blocking re-registration collisions — and it is not reversible
 * to the secret it verifies.
 */

/** Revoke every principal carrying this profile's id; already-revoked rows are left untouched. Idempotent. */
export const revokeAllForProfileWrite = (profileId: ProfileId, revokedAt: string): Write => ({
  sql: "-- principals:revokeAllForProfile\nUPDATE principals SET revokedAt = ?, updatedAt = ? WHERE profileId = ? AND revokedAt IS NULL",
  bindings: [revokedAt, revokedAt, profileId],
});

/** Every principal row of this profile — used by the deletion sweep test to assert revocation state. */
export const findByProfile = (
  profileId: ProfileId,
): Effect.Effect<
  ReadonlyArray<{ principalId: string; revokedAt: string | null }>,
  never,
  Database
> =>
  Effect.gen(function* () {
    const db = yield* Database;
    const rows = yield* db.query<{ principalId: string; revokedAt: string | null }>(
      "SELECT principalId, revokedAt FROM principals WHERE profileId = ? ORDER BY principalId ASC",
      [profileId],
    );
    return rows;
  });
