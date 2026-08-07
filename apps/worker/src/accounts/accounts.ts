import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import type { Credential } from "@job-index/domain/Access";
import { PrincipalId, ProfileId } from "@job-index/domain/Ids";
import { Accounts } from "../services/Accounts.ts";
import { Database } from "../services/Database.ts";
import { sha256Hex, timingSafeEqual } from "./hash.ts";
import { readProfileRow, toDomainErasure, writeErasureRequested } from "./profileRow.ts";

/**
 * CONTRACT GAP — read before touching this file.
 *
 * `Credential`'s `ApiKey` variant (Access.ts) is `{ principal: PrincipalId }`:
 * a caller resolves to a principal, but no domain model anywhere records
 * *how* — there is no `Principal` (or similar) `Model.Class`, so
 * `db/schema.sql` has no table mapping a hashed API key back to one. The
 * `principals` table this file queries is this slot's concrete ask for that
 * gap, mirroring the `apiKeyHash` column the pre-migration schema already had
 * (`migrations/0005_production_platform.sql`) before this rewrite dropped it.
 * Same status as the `profiles` table documented in `profileRow.ts`: correct
 * against the in-test fake, `no such table: principals` against real D1 until
 * a `Principal` model exists and `schema.ts --emit` is re-run.
 *
 * Everything session-shaped below has no such gap: `sessions` is generated
 * from `Access.ts`'s `Session` `Model.Class` and already exists in
 * `db/schema.sql`.
 */
interface PrincipalRow {
  readonly id: string;
  readonly profileId: string;
  readonly apiKeyHash: string;
}

interface SessionRow {
  readonly id: string;
  readonly principalId: string;
  readonly profileId: string;
  readonly tokenHash: string;
  readonly expiresAt: number;
  readonly revokedAt: string | null;
}

/**
 * How long a purge sweep waits after a request before it may delete the row.
 *
 * DEFAULT TAKEN, not sourced: WS-0012 lists "erasure and retention policy —
 * what deletion means, and after how long" as an operator decision blocking
 * slots 1 and 5, and nothing in the frozen contracts states a duration.
 * Thirty days matches common GDPR-erasure grace windows and is easy to
 * change in one place; it is a placeholder for an answer this slot cannot
 * source, not a policy claim.
 */
const ERASURE_GRACE_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

type DatabaseService = Database["Service"];

const findValidSession = (
  db: DatabaseService,
  presentedHash: string,
): Effect.Effect<Option.Option<SessionRow>> =>
  Effect.gen(function* () {
    const rows = yield* db.query<SessionRow>(
      "-- accounts:findSessionByTokenHash\nSELECT id, principalId, profileId, tokenHash, expiresAt, revokedAt FROM sessions WHERE tokenHash = ?",
      [presentedHash],
    );
    const row = rows[0];
    if (row === undefined) return Option.none();
    // The SQL equality above is an index lookup, not a security boundary on its
    // own; re-verify the match with a comparison that does not leak timing.
    if (!timingSafeEqual(row.tokenHash, presentedHash)) return Option.none();
    if (row.revokedAt !== null) return Option.none();
    if (row.expiresAt <= Date.now()) return Option.none();
    return Option.some(row);
  });

const findValidPrincipal = (
  db: DatabaseService,
  presentedHash: string,
): Effect.Effect<Option.Option<PrincipalRow>> =>
  Effect.gen(function* () {
    const rows = yield* db.query<PrincipalRow>(
      "-- accounts:findPrincipalByApiKeyHash\nSELECT id, profileId, apiKeyHash FROM principals WHERE apiKeyHash = ?",
      [presentedHash],
    );
    const row = rows[0];
    if (row === undefined) return Option.none();
    if (!timingSafeEqual(row.apiKeyHash, presentedHash)) return Option.none();
    return Option.some(row);
  });

const resolveProfileId = (
  db: DatabaseService,
  credential: Credential,
): Effect.Effect<Option.Option<ProfileId>> =>
  credential._tag === "Session"
    ? db
        .query<{ profileId: string }>(
          "-- accounts:profileForSession\nSELECT profileId FROM sessions WHERE id = ?",
          [credential.session],
        )
        .pipe(
          Effect.map((rows) =>
            rows[0]
              ? Option.some(Schema.decodeUnknownSync(ProfileId)(rows[0].profileId))
              : Option.none(),
          ),
        )
    : db
        .query<{ profileId: string }>(
          "-- accounts:profileForPrincipal\nSELECT profileId FROM principals WHERE id = ?",
          [credential.principal],
        )
        .pipe(
          Effect.map((rows) =>
            rows[0]
              ? Option.some(Schema.decodeUnknownSync(ProfileId)(rows[0].profileId))
              : Option.none(),
          ),
        );

/**
 * Resolves a presented secret to a `Credential`, or to nothing.
 *
 * One lookup path per credential kind: hash the secret once, then try each
 * table's hash column in turn. Neither table trusts SQL equality alone — see
 * `findValidSession`/`findValidPrincipal`.
 */
export const layer = Layer.effect(
  Accounts,
  Effect.gen(function* () {
    const db = yield* Database;

    const authenticate = (presented: string): Effect.Effect<Credential | undefined> =>
      Effect.gen(function* () {
        const hash = yield* sha256Hex(presented);

        const session = yield* findValidSession(db, hash);
        if (Option.isSome(session)) {
          const credential: Credential = {
            _tag: "Session",
            principal: Schema.decodeUnknownSync(PrincipalId)(session.value.principalId),
            session: session.value.id,
          };
          return credential;
        }

        const principal = yield* findValidPrincipal(db, hash);
        if (Option.isSome(principal)) {
          const credential: Credential = {
            _tag: "ApiKey",
            principal: Schema.decodeUnknownSync(PrincipalId)(principal.value.id),
          };
          return credential;
        }

        return undefined;
      });

    const profileOf = (credential: Credential): Effect.Effect<ProfileId | undefined> =>
      Effect.gen(function* () {
        const profileId = yield* resolveProfileId(db, credential);
        if (Option.isNone(profileId)) return undefined;

        const row = yield* readProfileRow(db, profileId.value);
        const erasure = toDomainErasure(row);
        // Erasure blocks access at the point identity resolves to a profile,
        // rather than every downstream reader re-checking it.
        return erasure._tag === "Active" ? profileId.value : undefined;
      });

    const requestErasure = (profile: ProfileId): Effect.Effect<void> =>
      Effect.gen(function* () {
        const now = new Date();
        const nowIso = now.toISOString();
        const purgeAfter = new Date(now.getTime() + ERASURE_GRACE_PERIOD_MS).toISOString();
        yield* db.transaction(writeErasureRequested(db, profile, nowIso, purgeAfter, nowIso));
      });

    return { authenticate, profileOf, requestErasure };
  }),
);
