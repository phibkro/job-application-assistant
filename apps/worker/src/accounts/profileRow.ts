import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { ProfileRecord } from "@job-index/domain/Profile";
import type { Profile } from "@job-index/domain/Profile";
import type { Erasure } from "@job-index/domain/Access";
import type { ProfileId, ProposalId } from "@job-index/domain/Ids";
import type { Database, Write } from "../services/Database.ts";
import type { VersionedProfile } from "../services/Accounts.ts";
import {
  FIND_PROFILE_ROW,
  INSERT_PROFILE,
  INSERT_PROFILE_FOR_PENDING_PROPOSAL,
  INSERT_PROFILE_IF_MISSING,
  PROFILE_FIELDS,
  UPDATE_PROFILE,
  UPDATE_PROFILE_FOR_PENDING_PROPOSAL,
  UPDATE_PROFILE_IF_VERSION,
} from "./sql.ts";

/**
 * The flat shape a `profiles` row takes over `Database.query`/`run`.
 *
 * Read off `ProfileRecord`'s *encoded* side rather than restated: that is
 * precisely what `db/schema.sql`'s `profiles` table was generated from, so a
 * row shape that disagrees with the table is no longer expressible. `cv` and
 * `erasure` stay JSON text at this layer — decoded through the schema below,
 * not by hand — because that is how `Model.JsonFromString` says the column is
 * encoded.
 */
export type ProfileRow = typeof ProfileRecord.select.Encoded;

const encodeCv = Schema.encodeSync(ProfileRecord.select.fields.cv);
const decodeCv = Schema.decodeUnknownSync(ProfileRecord.select.fields.cv);
const encodeErasure = Schema.encodeSync(ProfileRecord.select.fields.erasure);
const decodeErasure = Schema.decodeUnknownSync(ProfileRecord.select.fields.erasure);

export const emptyProfile: Profile = {
  headline: "",
  summary: "",
  location: "",
  languages: "",
  skills: [],
  experience: [],
  education: [],
};

const ACTIVE_ERASURE: Erasure = { _tag: "Active" };

export const toDomainProfile = (row: ProfileRow): Profile => decodeCv(row.cv);

/** Decoded, not merely parsed: a corrupted erasure column should fail loud rather than silently grant access. */
export const toDomainErasure = (row: ProfileRow | undefined): Erasure =>
  row === undefined ? ACTIVE_ERASURE : decodeErasure(row.erasure);

export const toVersionedProfile = (row: ProfileRow | undefined): VersionedProfile => ({
  profile: row === undefined ? emptyProfile : toDomainProfile(row),
  profileUpdatedAt: row?.updatedAt ?? null,
});

/** A profile version always advances, even when the wall clock stalls or moves backwards. */
export const nextProfileUpdatedAt = (storedUpdatedAt: string | null, clockNow: string): string => {
  if (storedUpdatedAt === null) return clockNow;
  const stored = DateTime.makeUnsafe(storedUpdatedAt);
  const clock = DateTime.makeUnsafe(clockNow);
  return DateTime.formatIso(
    DateTime.toEpochMillis(clock) > DateTime.toEpochMillis(stored)
      ? clock
      : DateTime.addDuration(stored, 1),
  );
};

type DatabaseService = Database["Service"];

export const readProfileRow = (
  db: DatabaseService,
  profileId: ProfileId,
): Effect.Effect<ProfileRow | undefined> =>
  db.query<ProfileRow>(FIND_PROFILE_ROW, [profileId]).pipe(Effect.map((rows) => rows[0]));

const writeProfileRow = (db: DatabaseService, row: ProfileRow): Effect.Effect<void> =>
  Effect.gen(function* () {
    const existing = yield* readProfileRow(db, row.profileId as ProfileId);
    if (existing === undefined) {
      yield* db.run(
        INSERT_PROFILE,
        PROFILE_FIELDS.map((field) => row[field as keyof ProfileRow]),
      );
    } else {
      yield* db.run(UPDATE_PROFILE, [row.cv, row.erasure, row.updatedAt, row.profileId]);
    }
  });

/** Writes the CV unconditionally for internal account setup and focused tests. */
export const writeProfile = (
  db: DatabaseService,
  profileId: ProfileId,
  profile: Profile,
  now: string,
): Effect.Effect<void> =>
  Effect.gen(function* () {
    const existing = yield* readProfileRow(db, profileId);
    yield* writeProfileRow(db, {
      profileId,
      cv: encodeCv(profile),
      erasure: existing?.erasure ?? encodeErasure(ACTIVE_ERASURE),
      createdAt: existing?.createdAt ?? now,
      updatedAt: nextProfileUpdatedAt(existing?.updatedAt ?? null, now),
    });
  });

/**
 * Replace the whole profile only at the version the caller reviewed.
 *
 * `undefined` means the compare-and-swap lost. The service rereads to report
 * the actual version; this function never retries a whole-profile replacement.
 */
export const writeProfileIfVersion = (
  db: DatabaseService,
  profileId: ProfileId,
  profile: Profile,
  expectedUpdatedAt: string | null,
  now: string,
): Effect.Effect<VersionedProfile | undefined> =>
  Effect.gen(function* () {
    const existing = yield* readProfileRow(db, profileId);
    if ((existing?.updatedAt ?? null) !== expectedUpdatedAt) return undefined;

    const updatedAt = nextProfileUpdatedAt(expectedUpdatedAt, now);
    const row: ProfileRow = {
      profileId,
      cv: encodeCv(profile),
      erasure: existing?.erasure ?? encodeErasure(ACTIVE_ERASURE),
      createdAt: existing?.createdAt ?? now,
      updatedAt,
    };
    const affected =
      existing === undefined
        ? yield* db.runAffected(INSERT_PROFILE_IF_MISSING, [
            ...PROFILE_FIELDS.map((field) => row[field as keyof ProfileRow]),
            profileId,
          ])
        : yield* db.runAffected(UPDATE_PROFILE_IF_VERSION, [
            row.cv,
            row.erasure,
            row.updatedAt,
            row.profileId,
            expectedUpdatedAt,
          ]);
    return affected === 1 ? { profile, profileUpdatedAt: updatedAt } : undefined;
  });

export interface PendingProposalProfileWrite {
  readonly write: Write;
  readonly profileUpdatedAt: string;
}

/**
 * Prepare the profile-first half of proposal acceptance from one observed
 * row. Existing rows compare both encoded CV and version; missing rows insert
 * only while the same owner-scoped proposal is still pending.
 */
export const profileWriteForPendingProposal = (
  profileId: ProfileId,
  profile: Profile,
  proposalId: ProposalId,
  existing: ProfileRow | undefined,
  now: string,
): PendingProposalProfileWrite => {
  const updatedAt = nextProfileUpdatedAt(existing?.updatedAt ?? null, now);
  const row: ProfileRow = {
    profileId,
    cv: encodeCv(profile),
    erasure: existing?.erasure ?? encodeErasure(ACTIVE_ERASURE),
    createdAt: existing?.createdAt ?? now,
    updatedAt,
  };
  return {
    profileUpdatedAt: updatedAt,
    write:
      existing === undefined
        ? {
            sql: INSERT_PROFILE_FOR_PENDING_PROPOSAL,
            bindings: [
              ...PROFILE_FIELDS.map((field) => row[field as keyof ProfileRow]),
              profileId,
              proposalId,
              profileId,
            ],
          }
        : {
            sql: UPDATE_PROFILE_FOR_PENDING_PROPOSAL,
            bindings: [
              row.cv,
              row.updatedAt,
              profileId,
              existing.cv,
              existing.updatedAt,
              proposalId,
              profileId,
            ],
          },
  };
};

/** Marks erasure, preserving whatever CV fields and `createdAt` the row already carries (or blank ones, for a profile with none yet). */
export const writeErasureRequested = (
  db: DatabaseService,
  profileId: ProfileId,
  requestedAt: string,
  purgeAfter: string,
  now: string,
): Effect.Effect<void> =>
  Effect.gen(function* () {
    const existing = yield* readProfileRow(db, profileId);
    yield* writeProfileRow(db, {
      profileId,
      cv: existing?.cv ?? encodeCv(emptyProfile),
      erasure: encodeErasure({ _tag: "Requested", at: requestedAt, purgeAfter }),
      createdAt: existing?.createdAt ?? now,
      updatedAt: nextProfileUpdatedAt(existing?.updatedAt ?? null, now),
    });
  });
