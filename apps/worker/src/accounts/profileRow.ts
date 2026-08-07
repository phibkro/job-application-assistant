import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { ProfileRecord } from "@job-index/domain/Profile";
import type { Profile } from "@job-index/domain/Profile";
import type { Erasure } from "@job-index/domain/Access";
import type { ProfileId } from "@job-index/domain/Ids";
import type { Database } from "../services/Database.ts";
import { FIND_PROFILE_ROW, INSERT_PROFILE, PROFILE_FIELDS, UPDATE_PROFILE } from "./sql.ts";

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

/** Writes the CV, preserving whatever erasure state and `createdAt` the row already carries. */
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
      updatedAt: now,
    });
  });

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
      updatedAt: now,
    });
  });
