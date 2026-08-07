import * as Schema from "effect/Schema";
import { CanonicalJobId, OccurrenceId, Sequence, SourceId } from "./Ids.ts";

/** A vacancy as a source published it, before identity is derived. */
export const RawListing = Schema.Struct({
  sourceId: SourceId,
  sourceName: Schema.String,
  externalId: Schema.String,
  title: Schema.String,
  employerName: Schema.String,
  location: Schema.String,
  description: Schema.String,
  applicationUrl: Schema.String,
  publishedAt: Schema.String,
  /**
   * Optional because adverts routinely say "Snarest" where a date belongs.
   * Free text must not become a date, so it becomes nothing.
   */
  deadline: Schema.optional(Schema.String),
});
export type RawListing = typeof RawListing.Type;

export const JobStatus = Schema.Union([
  Schema.TaggedStruct("Active", {}),
  Schema.TaggedStruct("Closed", { closedAt: Schema.String }),
]);
export type JobStatus = typeof JobStatus.Type;

/**
 * A raw listing with identity derived.
 *
 * The derivation need not match any previous implementation: the corpus is a
 * cache and can be rebuilt from sources, so the new service starts on a new
 * database. What the derivation must be is *stable within a deployment* — these
 * ids partition the corpus, so changing how they are computed after data exists
 * silently re-partitions it.
 */
export const NormalizedListing = Schema.Struct({
  occurrenceId: OccurrenceId,
  canonicalJobId: CanonicalJobId,
  canonicalKey: Schema.String,
  contentFingerprint: Schema.String,
  listing: RawListing,
});
export type NormalizedListing = typeof NormalizedListing.Type;

/** One vacancy, however many sources advertised it. */
export const CanonicalJob = Schema.Struct({
  id: CanonicalJobId,
  title: Schema.String,
  employerName: Schema.String,
  location: Schema.String,
  description: Schema.String,
  applicationUrl: Schema.String,
  publishedAt: Schema.String,
  deadline: Schema.optional(Schema.String),
  status: JobStatus,
  sequence: Sequence,
  changedAt: Schema.String,
  sources: Schema.Array(SourceId),
});
export type CanonicalJob = typeof CanonicalJob.Type;

/**
 * What an observation did to the corpus. Named rather than counted, because
 * "canonical_changes: 2" cannot answer which two.
 */
export const ObservationOutcome = Schema.Union([
  Schema.TaggedStruct("CreatedCanonical", { id: CanonicalJobId }),
  Schema.TaggedStruct("AddedDuplicateOccurrence", { id: CanonicalJobId }),
  Schema.TaggedStruct("UpdatedCanonical", { id: CanonicalJobId }),
  Schema.TaggedStruct("ReopenedCanonical", { id: CanonicalJobId }),
  Schema.TaggedStruct("ClosedCanonical", { id: CanonicalJobId }),
  Schema.TaggedStruct("Unchanged", {}),
]);
export type ObservationOutcome = typeof ObservationOutcome.Type;
