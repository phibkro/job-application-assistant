import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as HttpApiBuilder from "effect/http-api/HttpApiBuilder";
import { api, CurrentPrincipal } from "../Api.ts";
import { Database } from "../services/Database.ts";
import { purgeWritesFor } from "../db/Erase.ts";
import { revokeAllForProfileWrite } from "../db/repositories/Principals.ts";
import { tombstoneWrite } from "../accounts/profileRow.ts";

/**
 * WS-0019 self-service deletion — the server half of the account's last act.
 *
 * One atomic batch, in this order: principals revoked first (access dies
 * with the data, not after it), then the thirteen-table purge batch from
 * `db/Erase.ts` (sessions first within it, per its own ordering note), then
 * the `profiles` tombstone. D1 commits the batch whole or not at all, and
 * every statement is idempotent (`DELETE WHERE profileId = ?`; revocation
 * guarded by `revokedAt IS NULL`; tombstone unconditional), so a retried
 * request that failed mid-flight cannot half-delete or double-revoke.
 *
 * `Accounts.requestErasure` is deliberately not involved: that marks a
 * grace-period request for a scheduled sweep nobody has wired. This is
 * immediate execution of an explicitly confirmed request.
 */
export const layer = HttpApiBuilder.group(api, "account", (handlers) =>
  handlers.handle("deleteAccount", () =>
    Effect.gen(function* () {
      const db = yield* Database;
      const principal = yield* CurrentPrincipal;
      const now = DateTime.formatIso(yield* DateTime.now);

      yield* db.atomic([
        revokeAllForProfileWrite(principal.profileId, now),
        ...purgeWritesFor(principal.profileId),
        tombstoneWrite(principal.profileId, now),
      ]);

      return { erased: true, at: now };
    }),
  ),
);
