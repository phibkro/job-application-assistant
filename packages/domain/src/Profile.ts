import * as Schema from "effect/Schema";

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
