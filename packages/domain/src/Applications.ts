import * as Schema from "effect/Schema";
import * as Model from "effect/unstable/schema/Model";
import { ApplicationId, CanonicalJobId, PlatformId, ProfileId, SavedJobId } from "./Ids.ts";

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

/** A person's bookmark of a vacancy, and what `prepare` resolves `savedJob` against. */
export class SavedJob extends Model.Class<SavedJob>("SavedJob")({
  id: SavedJobId,
  profileId: ProfileId,
  canonicalJobId: CanonicalJobId,
  note: Schema.String,
  createdAt: Model.DateTimeInsert,
}) {}

/**
 * One prepared-or-submitted application: what `prepare` produced, and the
 * lifecycle `setStatus` moves it through afterward.
 */
export class ApplicationRecord extends Model.Class<ApplicationRecord>("ApplicationRecord")({
  id: ApplicationId,
  profileId: ProfileId,
  savedJobId: SavedJobId,
  canonicalJobId: CanonicalJobId,
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
