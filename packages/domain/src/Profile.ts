import * as Schema from "effect/Schema";
import * as Model from "effect/unstable/schema/Model";
import { ProfileId } from "./Ids.ts";
import { Erasure } from "./Access.ts";

/**
 * The CV, as structured data rather than a document.
 *
 * Structured because a draft is composed from it: the letter names the
 * experience most relevant to a given advert, which requires the parts to be
 * addressable. A PDF would make that a parsing problem.
 *
 * This is personal data. It is written and read only by its owner, and the
 * account's erasure request removes it.
 */
export const Experience = Schema.Struct({
  title: Schema.String,
  employer: Schema.String,
  period: Schema.String,
  highlights: Schema.Array(Schema.String),
});
export type Experience = typeof Experience.Type;

/**
 * The CV as a value, unattached to any account. Used for input and rendering.
 */
export const Profile = Schema.Struct({
  headline: Schema.String,
  summary: Schema.String,
  location: Schema.String,
  languages: Schema.String,
  skills: Schema.Array(Schema.String),
  experience: Schema.Array(Experience),
  education: Schema.Array(Schema.String),
});
export type Profile = typeof Profile.Type;

/**
 * The stored profile: a CV attached to an account, plus its erasure state.
 *
 * A persisted aggregate must be a `Model.Class`, because the schema snapshot is
 * generated from those alone. This was a plain struct, so no `profiles` table
 * existed and two slots implemented against a table they had to assume.
 *
 * The CV travels as one JSON column rather than exploded into columns: it is
 * read and written whole, never queried field by field, and giving it columns
 * would invite queries that read a person's history for reasons unrelated to
 * their application.
 */
export class ProfileRecord extends Model.Class<ProfileRecord>("ProfileRecord")({
  profileId: ProfileId,
  /**
   * Deliberately not `Sensitive`. That annotation means "never appears in a
   * JSON variant", which is right for a credential hash and wrong here: the CV
   * is personal data whose owner reads and edits it through the API. The
   * protection it needs is authorization, not omission.
   */
  cv: Model.JsonFromString(Profile),
  erasure: Model.JsonFromString(Erasure),
  createdAt: Model.DateTimeInsert,
  updatedAt: Model.DateTimeUpdate,
}) {}
