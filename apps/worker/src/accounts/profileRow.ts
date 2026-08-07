import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { Erasure } from "@job-index/domain/Access";
import type { Profile } from "@job-index/domain/Profile";
import type { ProfileId } from "@job-index/domain/Ids";
import type { Database } from "../services/Database.ts";

/**
 * CONTRACT GAP — read before touching this file.
 *
 * `Profile` (packages/domain/src/Profile.ts) is a plain `Schema.Struct`, not
 * a `Model.Class`, so `scripts/ts/schema.ts` never generates a table for it —
 * it only walks the `Model.Class` list in that script. The same is true of
 * erasure: `Erasure` (Access.ts) is a `Schema.Union`, and no `Model.Class`
 * anywhere carries it as a field. `db/schema.sql` therefore has no home for
 * either the CV or the erasure state this slot's contract (`Accounts.ts`,
 * `Profiles.ts`) requires it to persist.
 *
 * Per WS-0012 ("a slot that needs a new table stops and asks; it does not
 * edit the snapshot"), this is that ask, made concrete: the query below
 * assumes a `profiles` table shaped like the columns in `ProfileRow`. It does
 * not exist in `db/schema.sql` yet. Closing this gap means giving `Profile`
 * a `Model.Class` (e.g. adding `profileId` and an `erasure` field encoded
 * with `Model.JsonFromString(Erasure)`) and re-running `schema.ts --emit` —
 * both of which are edits to frozen contracts this slot does not own.
 *
 * Until then, every function here runs correctly against the in-test fake
 * (`fixtures.ts`) and will fail against real D1 with "no such table:
 * profiles". That failure is intentional signal, not a bug to hide: it is
 * what should happen until the schema gap above is closed.
 */
export interface ProfileRow {
  readonly profileId: string;
  readonly headline: string;
  readonly summary: string;
  readonly location: string;
  readonly languages: string;
  readonly skills: string;
  readonly experience: string;
  readonly education: string;
  /** JSON-encoded `Erasure`. Co-located with the CV because erasure is a state of this same row. */
  readonly erasure: string;
  readonly updatedAt: string;
}

const ACTIVE_ERASURE_JSON = JSON.stringify({ _tag: "Active" } satisfies Erasure);

export const emptyProfile: Profile = {
  headline: "",
  summary: "",
  location: "",
  languages: "",
  skills: [],
  experience: [],
  education: [],
};

export const toDomainProfile = (row: ProfileRow): Profile => ({
  headline: row.headline,
  summary: row.summary,
  location: row.location,
  languages: row.languages,
  skills: JSON.parse(row.skills) as ReadonlyArray<string>,
  experience: JSON.parse(row.experience) as Profile["experience"],
  education: JSON.parse(row.education) as ReadonlyArray<string>,
});

/** Decoded, not merely parsed: a corrupted erasure column should fail loud rather than silently grant access. */
export const toDomainErasure = (row: ProfileRow | undefined): Erasure =>
  row === undefined
    ? { _tag: "Active" }
    : Schema.decodeUnknownSync(Erasure)(JSON.parse(row.erasure));

const buildRow = (
  profileId: ProfileId,
  profile: Profile,
  erasureJson: string,
  updatedAt: string,
): ProfileRow => ({
  profileId,
  headline: profile.headline,
  summary: profile.summary,
  location: profile.location,
  languages: profile.languages,
  skills: JSON.stringify(profile.skills),
  experience: JSON.stringify(profile.experience),
  education: JSON.stringify(profile.education),
  erasure: erasureJson,
  updatedAt,
});

type DatabaseService = Database["Service"];

export const readProfileRow = (
  db: DatabaseService,
  profileId: ProfileId,
): Effect.Effect<ProfileRow | undefined> =>
  db
    .query<ProfileRow>("-- accounts:findProfileRow\nSELECT * FROM profiles WHERE profileId = ?", [
      profileId,
    ])
    .pipe(Effect.map((rows) => rows[0]));

const writeProfileRow = (db: DatabaseService, row: ProfileRow): Effect.Effect<void> =>
  Effect.gen(function* () {
    const existing = yield* readProfileRow(db, row.profileId as ProfileId);
    if (existing === undefined) {
      yield* db.run(
        "-- accounts:insertProfile\nINSERT INTO profiles (profileId, headline, summary, location, languages, skills, experience, education, erasure, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
          row.profileId,
          row.headline,
          row.summary,
          row.location,
          row.languages,
          row.skills,
          row.experience,
          row.education,
          row.erasure,
          row.updatedAt,
        ],
      );
    } else {
      yield* db.run(
        "-- accounts:updateProfile\nUPDATE profiles SET headline = ?, summary = ?, location = ?, languages = ?, skills = ?, experience = ?, education = ?, erasure = ?, updatedAt = ? WHERE profileId = ?",
        [
          row.headline,
          row.summary,
          row.location,
          row.languages,
          row.skills,
          row.experience,
          row.education,
          row.erasure,
          row.updatedAt,
          row.profileId,
        ],
      );
    }
  });

/** Writes the CV, preserving whatever erasure state the row already carries. */
export const writeProfile = (
  db: DatabaseService,
  profileId: ProfileId,
  profile: Profile,
  now: string,
): Effect.Effect<void> =>
  Effect.gen(function* () {
    const existing = yield* readProfileRow(db, profileId);
    yield* writeProfileRow(
      db,
      buildRow(profileId, profile, existing?.erasure ?? ACTIVE_ERASURE_JSON, now),
    );
  });

/** Marks erasure, preserving whatever CV fields the row already carries (or blank ones, for a profile with none yet). */
export const writeErasureRequested = (
  db: DatabaseService,
  profileId: ProfileId,
  requestedAt: string,
  purgeAfter: string,
  now: string,
): Effect.Effect<void> =>
  Effect.gen(function* () {
    const existing = yield* readProfileRow(db, profileId);
    const profile = existing === undefined ? emptyProfile : toDomainProfile(existing);
    const erasureJson = JSON.stringify({
      _tag: "Requested",
      at: requestedAt,
      purgeAfter,
    } satisfies Erasure);
    yield* writeProfileRow(db, buildRow(profileId, profile, erasureJson, now));
  });
