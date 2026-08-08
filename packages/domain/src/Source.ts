import * as Schema from "effect/Schema";
import * as Model from "effect/unstable/schema/Model";
import { PlatformId } from "./Ids.ts";

/**
 * How a machine may read a platform's listings.
 *
 * A tagged union rather than a string, because every caller must handle the
 * case it cannot serve: `Unknown` means nobody has established how this
 * platform may be read, and ingestion must refuse rather than guess. As a
 * string that refusal is a convention; as a variant it is a type error to omit.
 */
export const AcquisitionTier = Schema.Union([
  Schema.TaggedStruct("Feed", {}),
  Schema.TaggedStruct("Scripted", {}),
  Schema.TaggedStruct("Agent", {}),
  Schema.TaggedStruct("Unknown", {}),
]);
export type AcquisitionTier = typeof AcquisitionTier.Type;

/**
 * Whether a platform permits automated application submission.
 *
 * `Unreviewed` is the default and forbids automation. A platform earns
 * `Allowed` only by a person reading its terms — an observation about how a
 * page renders can never establish it.
 */
export const AutomationPolicy = Schema.Union([
  Schema.TaggedStruct("Allowed", {}),
  Schema.TaggedStruct("AssistedOnly", {}),
  Schema.TaggedStruct("Prohibited", {}),
  Schema.TaggedStruct("Unreviewed", {}),
]);
export type AutomationPolicy = typeof AutomationPolicy.Type;

export const CatalogEntry = Schema.Struct({
  id: PlatformId,
  platform: Schema.String,
  category: Schema.String,
  listingsUrl: Schema.String,
  /**
   * Where a machine reads, when that is not where a person browses. NAV
   * publishes an official feed at a different host from its job site, and
   * ingestion starting at the human page would fetch a web page and decode
   * nothing. Absent for platforms where the two coincide.
   */
  feedUrl: Schema.optional(Schema.String),
  tier: AcquisitionTier,
  policy: AutomationPolicy,
  /** Agent acquisition costs a browser run, so it is the paid capability. */
  requiresPremium: Schema.Boolean,
  priority: Schema.String,
  confidence: Schema.String,
  notes: Schema.String,
  verifiedAt: Schema.String,
});
export type CatalogEntry = typeof CatalogEntry.Type;

/**
 * What a probe established about a platform, and when.
 *
 * Recorded separately from the entry because it answers a different question:
 * the sheet says which platforms exist, an observation says how one may be
 * read. Keeping them apart is what stops a probe from silently granting an
 * automation policy it has no basis to grant.
 */
export const Observation = Schema.Struct({
  platform: PlatformId,
  tier: AcquisitionTier,
  reason: Schema.String,
  observedAt: Schema.String,
  reachable: Schema.Boolean,
});
export type Observation = typeof Observation.Type;

/**
 * The stored catalogue row.
 *
 * `tier` and `policy` are flattened to their tags, the way `canonical_jobs`
 * stores a job's status: both are unions of empty variants, so the tag is the
 * whole value, and a plain column can be compared and indexed while a JSON
 * blob cannot. The mapping back to the tagged unions lives with the reader.
 *
 * `Unreviewed` is the policy default in the column as well as in the domain.
 * A platform that nobody has assessed must not be automatable because a row
 * was written carelessly.
 */
export class CatalogRecord extends Model.Class<CatalogRecord>("CatalogRecord")({
  id: PlatformId,
  platform: Schema.String,
  category: Schema.String,
  listingsUrl: Schema.String,
  feedUrl: Model.FieldOption(Schema.String),
  tierTag: Schema.Literals(["Feed", "Scripted", "Agent", "Unknown"]),
  policyTag: Schema.Literals(["Allowed", "AssistedOnly", "Prohibited", "Unreviewed"]),
  requiresPremium: Model.BooleanSqlite,
  priority: Schema.String,
  confidence: Schema.String,
  notes: Schema.String,
  verifiedAt: Schema.String,
  createdAt: Model.DateTimeInsert,
  updatedAt: Model.DateTimeUpdate,
}) {}
