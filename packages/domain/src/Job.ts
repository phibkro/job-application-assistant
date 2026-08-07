import * as Schema from "effect/Schema";
import * as Model from "effect/unstable/schema/Model";
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

/**
 * The stored `canonical_jobs` row.
 *
 * `CanonicalJob` above is the value callers pass around; this is the row.
 * They differ deliberately: the row carries the deduplication key no caller
 * should see, and it flattens the `status` union into two columns because
 * SQLite has no union type. The mapping between them is written once, in the
 * corpus slot's `rows.ts`, which derives its row type from this model rather
 * than restating the column list.
 */
export class CanonicalJobRecord extends Model.Class<CanonicalJobRecord>("CanonicalJobRecord")({
  id: CanonicalJobId,
  canonicalKey: Schema.String,
  title: Schema.String,
  employerName: Schema.String,
  location: Schema.String,
  description: Schema.String,
  applicationUrl: Schema.String,
  publishedAt: Schema.String,
  deadline: Model.FieldOption(Schema.String),
  statusTag: Schema.Literals(["Active", "Closed"]),
  statusClosedAt: Model.FieldOption(Schema.String),
  /**
   * Assigned by the corpus, not the database. A saved search asks what
   * changed after the sequence it last saw, so it must be monotonic across
   * the whole corpus rather than per row.
   */
  sequence: Sequence,
  changedAt: Schema.String,
  /** JSON array of `SourceId`: provenance, which no single column can hold. */
  sources: Model.JsonFromString(Schema.Array(SourceId)),
  /**
   * `title`/`employerName`/`location`, case- and diacritic-folded at write
   * time by `corpus/identity.ts`'s `normalizeText` (the same fold identity
   * derivation already uses). SQLite's `LIKE`/`LOWER()` only fold ASCII
   * case, so an unfolded `ØSTFOLD` and a search for `østfold` would not
   * match, and D1 ships no ICU collation to ask instead. Folding once at
   * observe time also means a search scans a plain column rather than
   * evaluating a function over every row on every request.
   */
  titleNormalized: Schema.String,
  employerNameNormalized: Schema.String,
  locationNormalized: Schema.String,
}) {}

/**
 * The stored `occurrences` row: one source's advert for one canonical vacancy.
 *
 * Retained per source after deduplication because provenance is the point —
 * which platform carried this vacancy is exactly what the corpus exists to
 * answer, and a merge that discards it cannot answer it later.
 */
export class OccurrenceRecord extends Model.Class<OccurrenceRecord>("OccurrenceRecord")({
  id: OccurrenceId,
  canonicalJobId: CanonicalJobId,
  sourceId: SourceId,
  externalId: Schema.String,
  contentFingerprint: Schema.String,
  /**
   * False once the source stops advertising it. Closure of the canonical is
   * the absence of *all* active occurrences, so absence has to be recorded
   * per occurrence: a vacancy still advertised elsewhere is not closed.
   */
  active: Model.BooleanSqlite,
  firstSeenAt: Schema.String,
  lastSeenAt: Schema.String,
}) {}
