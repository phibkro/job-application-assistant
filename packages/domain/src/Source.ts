import * as Schema from "effect/Schema";
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
