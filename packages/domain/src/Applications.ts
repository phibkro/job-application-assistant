import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Model from "effect/unstable/schema/Model";
import { ApplicationId, CanonicalJobId, PlatformId, ProfileId, SavedJobId } from "./Ids.ts";
import { JobSnapshot } from "./Job.ts";

/**
 * Persistence for the application loop.
 *
 * Three facts, three tables, none of them owned by an earlier slot:
 *
 * - `SavedJob` is the bookmark a `savedJob: SavedJobId` argument refers to —
 *   without it, `Applications.prepare` has a branded string and nothing to
 *   resolve it against. No table backed this anywhere in the schema.
 * - `ApplicationRecord` is `Applications`' own state: what `prepare` produced
 *   and what `setStatus` moves through its lifecycle.
 * - `PlatformPolicyRecord` is `Policy`'s own record of what a platform
 *   permits. `Source.AutomationPolicy` already names the four states; nothing
 *   had ever given it a table. `delivery_platforms.automationProhibited` is a
 *   boolean and cannot represent `AssistedOnly` — and its `DEFAULT 0` would
 *   read a merely-unreviewed platform as `Allowed`, which is the one thing
 *   `Policy`'s contract says must never happen. Reusing it was rejected for
 *   that reason; the two facts (can we fill this platform's form; may we
 *   automate this platform) are kept apart on purpose, the same way
 *   `Entitlements`/`Policy` are.
 */

export const ApplicationMethod = Schema.Literals(["assisted", "automated"]);
export type ApplicationMethod = typeof ApplicationMethod.Type;

export const ApplicationStatus = Schema.Literals([
  "ready",
  "submitted",
  "rejected",
  "interview",
  "offer",
  "withdrawn",
]);
export type ApplicationStatus = typeof ApplicationStatus.Type;

/** The four states `Source.AutomationPolicy` already names, flattened to one column. */
export const PolicyTag = Schema.Literals(["Allowed", "AssistedOnly", "Prohibited", "Unreviewed"]);
export type PolicyTag = typeof PolicyTag.Type;

/**
 * A person's bookmark of a vacancy, and what `prepare` resolves `savedJob`
 * against.
 *
 * `jobSnapshot` is taken once, here, at save time — the operator's decision:
 * "when a person saves or applies to a vacancy, we store the listing as it
 * was at that moment". `canonicalJobId` remains alongside it as a pointer to
 * the live corpus row, kept for what still needs the live row while it
 * exists (`Policy.forJob`); it is no longer what a person's history is read
 * from. Not `Model.Sensitive`: this is account-registered personal data the
 * owner is entitled to see in full, in their own export, the same reasoning
 * `ProfileRecord.cv` already gives for the CV itself.
 */
export class SavedJob extends Model.Class<SavedJob>("SavedJob")({
  id: SavedJobId,
  profileId: ProfileId,
  canonicalJobId: CanonicalJobId,
  jobSnapshot: Model.JsonFromString(JobSnapshot),
  note: Schema.String,
  createdAt: Model.DateTimeInsert,
}) {}

/**
 * One prepared-or-submitted application: what `prepare` produced, and the
 * lifecycle `setStatus` moves it through afterward.
 *
 * `jobSnapshot` is copied from the `SavedJob` it was prepared from, not
 * re-derived from the corpus a second time — one snapshot per vacancy per
 * person, taken at save time; applying inherits it rather than asking the
 * corpus what the advert looks like *now*. Duplicated onto this row (rather
 * than joined from `saved_jobs` on every read) for the same reason
 * `canonicalJobId` already was: an application is queried alone, and a
 * historical fact should not depend on a bookmark surviving unmodified next
 * to it.
 */
export class ApplicationRecord extends Model.Class<ApplicationRecord>("ApplicationRecord")({
  id: ApplicationId,
  profileId: ProfileId,
  savedJobId: SavedJobId,
  canonicalJobId: CanonicalJobId,
  jobSnapshot: Model.JsonFromString(JobSnapshot),
  method: ApplicationMethod,
  status: ApplicationStatus,
  applicationUrl: Schema.String,
  cv: Schema.String,
  letter: Schema.String,
  generator: Schema.String,
  /** Set when `prepare` downgraded `automated` to `assisted`; names why. */
  downgradeReason: Model.FieldOption(Schema.String),
  notes: Schema.String,
  createdAt: Model.DateTimeInsert,
  updatedAt: Model.DateTimeUpdate,
}) {}

/** What a platform is recorded to permit. Absence of a row, not a row here, means `Unreviewed`. */
export class PlatformPolicyRecord extends Model.Class<PlatformPolicyRecord>("PlatformPolicyRecord")(
  {
    platformId: PlatformId,
    policy: PolicyTag,
    updatedAt: Model.DateTimeUpdate,
  },
) {}

/**
 * Encodes one model instance through its `json` variant rather than `select`
 * — the same construction `Api.ts` relies on for the wire ("a field marked
 * `Model.Sensitive` cannot reach a response by construction, not by
 * review"). Nothing on `SavedJob`/`ApplicationRecord` is `Sensitive` today,
 * but the export path below should not have to remember to re-check that if
 * one ever becomes so; going through `json` makes it structurally moot.
 */
const encodeJson =
  <A>(variant: Schema.Codec<A, unknown>) =>
  (value: A): unknown =>
    Schema.encodeSync(variant)(value);

const savedJobJson = encodeJson<SavedJob>((SavedJob as never as { json: object }).json as never);
const applicationJson = encodeJson<ApplicationRecord>(
  (ApplicationRecord as never as { json: object }).json as never,
);

/**
 * A person's saved jobs and applications, as portable JSON text — the same
 * guarantee `Profile.toJson` gives the CV, extended to the other half of an
 * account's data (the operator's ruling: "a person's application history is
 * now their data too, so an export that omits it is incomplete").
 *
 * No `fromJson` counterpart, unlike `Profile`: this is what `save`/`prepare`
 * produced and `setStatus` moved through its lifecycle, not a document a
 * person maintains and re-uploads — there is nothing to import it back into.
 */
export const historyToJson = (
  savedJobs: ReadonlyArray<SavedJob>,
  applications: ReadonlyArray<ApplicationRecord>,
): string =>
  JSON.stringify(
    { savedJobs: savedJobs.map(savedJobJson), applications: applications.map(applicationJson) },
    null,
    2,
  );

/** `publishedAt` plus `deadline`, if the advert had one — shared by both sections below. */
const timing = (job: JobSnapshot): string =>
  job.deadline === undefined
    ? `Published ${job.publishedAt}`
    : `Published ${job.publishedAt} · Deadline ${job.deadline}`;

/**
 * The same history, rendered as Markdown a person can read or keep — as
 * complete as `Profile.toMarkdown`: every saved job and every application,
 * in the order given, nothing summarised away. Includes the composed CV and
 * letter for each application, because those are exactly what was submitted
 * on the person's behalf, not incidental detail.
 */
export const historyToMarkdown = (
  savedJobs: ReadonlyArray<SavedJob>,
  applications: ReadonlyArray<ApplicationRecord>,
): string => {
  const sections: Array<string> = [];

  if (savedJobs.length > 0) {
    const entries = savedJobs.map((saved) => {
      const job = saved.jobSnapshot;
      const lines = [
        `### ${job.title} — ${job.employerName}`,
        job.location,
        `Advert: ${job.applicationUrl}`,
        timing(job),
      ];
      if (saved.note.trim() !== "") lines.push(`Note: ${saved.note.trim()}`);
      return lines.join("\n");
    });
    sections.push(["## Saved jobs", ...entries].join("\n\n"));
  }

  if (applications.length > 0) {
    const entries = applications.map((application) => {
      const job = application.jobSnapshot;
      const lines = [
        `### ${job.title} — ${job.employerName}`,
        `Status: ${application.status} (${application.method})`,
        job.location,
        `Applied through: ${application.applicationUrl}`,
        timing(job),
      ];
      if (Option.isSome(application.downgradeReason)) {
        lines.push(`Downgraded from automated: ${application.downgradeReason.value}`);
      }
      if (application.notes.trim() !== "") lines.push(`Notes: ${application.notes.trim()}`);
      lines.push("", "**CV**", "", application.cv, "", "**Letter**", "", application.letter);
      return lines.join("\n");
    });
    sections.push(["## Applications", ...entries].join("\n\n"));
  }

  return sections.join("\n\n");
};
