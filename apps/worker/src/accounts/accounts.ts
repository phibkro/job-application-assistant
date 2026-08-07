import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { ERASURE_GRACE_PERIOD_MS } from "@job-index/domain/Access";
import type { Credential } from "@job-index/domain/Access";
import type { Principal } from "@job-index/domain/Principal";
import { PrincipalId, ProfileId } from "@job-index/domain/Ids";
import { Accounts } from "../services/Accounts.ts";
import { Database } from "../services/Database.ts";
import { sha256Hex, timingSafeEqual } from "./hash.ts";
import { readProfileRow, toDomainErasure, writeErasureRequested } from "./profileRow.ts";
import { FIND_PRINCIPAL_BY_API_KEY_HASH, PROFILE_FOR_PRINCIPAL } from "./sql.ts";

/**
 * The flat shape a `principals` row takes over `Database.query`. Read off
 * `Principal`'s encoded side, same reasoning as `ProfileRow` — see
 * `profileRow.ts`.
 */
type PrincipalRow = typeof Principal.select.Encoded;

interface SessionRow {
  readonly id: string;
  readonly principalId: string;
  readonly profileId: string;
  readonly tokenHash: string;
  readonly expiresAt: number;
  readonly revokedAt: string | null;
}

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
    const rows = yield* db.query<PrincipalRow>(FIND_PRINCIPAL_BY_API_KEY_HASH, [presentedHash]);
    const row = rows[0];
    if (row === undefined) return Option.none();
    if (!timingSafeEqual(row.apiKeyHash, presentedHash)) return Option.none();
    // "A revoked principal authenticates as nothing, and the row is
    // retained" — Principal.ts's own doc comment on `revokedAt`.
    if (row.revokedAt !== null) return Option.none();
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
        .query<{ profileId: string }>(PROFILE_FOR_PRINCIPAL, [credential.principal])
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
            principal: Schema.decodeUnknownSync(PrincipalId)(principal.value.principalId),
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
        yield* writeErasureRequested(db, profile, nowIso, purgeAfter, nowIso);
      });

    return { authenticate, profileOf, requestErasure };
  }),
);
