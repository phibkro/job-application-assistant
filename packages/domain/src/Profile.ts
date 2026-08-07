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

/**
 * The profile as portable JSON text.
 *
 * Goes through `Profile`'s own encoder rather than `JSON.stringify` on the
 * value directly, so if the schema ever grows a field that encodes
 * differently from how it is held in memory, export follows without a second
 * definition to keep in sync with the first.
 */
export const toJson = (profile: Profile): string =>
  JSON.stringify(Schema.encodeSync(Profile)(profile), null, 2);

/**
 * The inverse of `toJson`, and the only sanctioned way back in.
 *
 * `onExcessProperty: "error"` is what makes this strict rather than merely
 * typed: the default schema decode drops a key it does not recognise, which
 * would turn a typo'd field or a future export version into a silent partial
 * replacement of someone's CV. Failing here instead means the thrown
 * `SchemaError`'s message names the offending key, which is what a person
 * editing the file by hand needs in order to fix it. Invalid JSON syntax
 * fails the same way, with `JSON.parse`'s own message.
 */
export const fromJson = (json: string): Profile =>
  Schema.decodeUnknownSync(Profile, { onExcessProperty: "error" })(JSON.parse(json));

/**
 * The profile rendered as Markdown a person can read, paste into an
 * application, or keep in a repository.
 *
 * Complete rather than composed: nothing is reordered against a job and
 * nothing is truncated, because an export that quietly drops entries is not
 * the export a person can leave the service with. `composeCv` (in the
 * worker's `drafting` module) renders a different product — one entry's CV
 * ranked and trimmed for a specific advert — and stays there, next to the
 * ranking it depends on; this function has no job to rank against and
 * nothing to trim for.
 *
 * Every section is conditional on having something to say, so a sparse
 * profile reads as a short document rather than a scaffold of empty
 * headings and dangling bullets.
 */
export const toMarkdown = (profile: Profile): string => {
  const sections: Array<string> = [];

  const headline = profile.headline.trim();
  const location = profile.location.trim();
  const header = [headline !== "" ? `# ${headline}` : "", location].filter((line) => line !== "");
  if (header.length > 0) sections.push(header.join("\n"));

  const summary = profile.summary.trim();
  if (summary !== "") sections.push(`## Summary\n\n${summary}`);

  if (profile.experience.length > 0) {
    const entries = profile.experience.map((entry) => {
      const highlights = entry.highlights
        .filter((highlight) => highlight.trim() !== "")
        .map((highlight) => `- ${highlight.trim()}`);
      return [
        `### ${entry.title.trim()} — ${entry.employer.trim()} (${entry.period.trim()})`,
        ...highlights,
      ].join("\n");
    });
    sections.push(["## Experience", ...entries].join("\n\n"));
  }

  const skills = profile.skills.filter((skill) => skill.trim() !== "");
  if (skills.length > 0) sections.push(`## Skills\n\n${skills.join(", ")}`);

  const education = profile.education.filter((entry) => entry.trim() !== "");
  if (education.length > 0) {
    sections.push(`## Education\n\n${education.map((entry) => `- ${entry}`).join("\n")}`);
  }

  const languages = profile.languages.trim();
  if (languages !== "") sections.push(`## Languages\n\n${languages}`);

  return sections.join("\n\n");
};
