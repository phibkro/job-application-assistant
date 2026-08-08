import * as Schema from "effect/Schema";
import * as Model from "effect/unstable/schema/Model";
import { CanonicalJobId, OccurrenceId, PlatformId, Sequence, SourceId } from "./Ids.ts";

/** A vacancy as a source published it, before identity is derived. */
export const RawListing = Schema.Struct({
  sourceId: SourceId,
  sourceName: Schema.String,
  /**
   * Which acquisition mechanism produced this sighting — distinct from
   * `sourceId` for the same reason `identity.ts` already documents (NAV's
   * feed calls itself `"nav"` while the catalogue calls it
   * `"arbeidsplassen-nav"`). Recorded per observation, not looked up later,
   * because there is no reliable `sourceId -> platform` table to look it up
   * *in* — the adapter that produced this listing already knows which
   * platform it read, so it is the one place this fact is cheap to carry.
   * `hydrate` needs it to route a targeted detail fetch back to the same
   * adapter that produced the summary.
   */
  platformId: PlatformId,
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
  /**
   * Whether `description`/`deadline` are genuine detail content or a
   * feed-only placeholder. A feed adapter (NAV) sets this `false` on every
   * page it reads: the whole point of deferred hydration is that a page
   * fetch never carries real detail. A scripted adapter that scrapes a full
   * page per vacancy (JSON-LD) sets it `true`, because there is no cheaper
   * "summary" tier to defer to — see `Job.ts`'s `CanonicalJobHydration`.
   */
  hydrated: Schema.Boolean,
});
export type RawListing = typeof RawListing.Type;

export const JobStatus = Schema.Union([
  Schema.TaggedStruct("Active", {}),
  Schema.TaggedStruct("Closed", { closedAt: Schema.String }),
]);
export type JobStatus = typeof JobStatus.Type;

/**
 * Whether a detail fetch has ever completed for this vacancy.
 *
 * A tagged union rather than an optional `description` on `CanonicalJob`
 * itself: "we have not fetched this yet" and "this advert genuinely has no
 * description" are different facts, and only one of them is worth retrying.
 * Collapsing them into an empty string would make the retry decision a
 * guess; a caller that needs `description`/`deadline` must first prove it
 * has a `Hydrated` value, which is what makes composing against a blank
 * advert (see `snapshotOf` below) a type error rather than a bug some review
 * has to catch.
 */
export const CanonicalJobHydration = Schema.Union([
  Schema.TaggedStruct("Unhydrated", {}),
  Schema.TaggedStruct("Hydrated", {
    description: Schema.String,
    deadline: Schema.optional(Schema.String),
  }),
]);
export type CanonicalJobHydration = typeof CanonicalJobHydration.Type;

/**
 * The fields only a detail fetch supplies, and nothing else: not `title`,
 * `employerName`, or `location`, because identity is derived from those (see
 * `corpus/identity.ts`'s `deriveCanonicalKey`) and a detail fetch must never
 * be able to retroactively move a vacancy's identity. `applicationUrl` is
 * included even though a summary already carries one, because a detail
 * fetch commonly resolves a *better* one (the employer's own application
 * link, rather than NAV's public advert page) — see
 * `design-specs/deferred-hydration.md`'s field table.
 *
 * Shared between `@job-index/adapters` (what `SourceAdapter.hydrate`
 * returns) and the worker's `Corpus`/`Hydration` (what gets written back),
 * so the two sides of that seam cannot drift on what "detail" means.
 */
export interface DetailFields {
  readonly description: string;
  readonly applicationUrl: string;
  readonly deadline?: string;
}

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

/**
 * One vacancy, however many sources advertised it.
 *
 * `applicationUrl` stays required: NAV's public advert URL is derivable from
 * the entry's own id, so even a job nobody has opened yet carries a real
 * link a person can follow with no detail fetch — see
 * `design-specs/deferred-hydration.md`. `description`/`deadline` are the two
 * fields only a detail fetch supplies, so they live behind `hydration`
 * rather than beside it.
 */
export const CanonicalJob = Schema.Struct({
  id: CanonicalJobId,
  title: Schema.String,
  employerName: Schema.String,
  location: Schema.String,
  applicationUrl: Schema.String,
  publishedAt: Schema.String,
  status: JobStatus,
  sequence: Sequence,
  changedAt: Schema.String,
  sources: Schema.Array(SourceId),
  hydration: CanonicalJobHydration,
});
export type CanonicalJob = typeof CanonicalJob.Type;

/** `CanonicalJob` narrowed to the branch that actually carries `description`/`deadline`. */
export type HydratedCanonicalJob = CanonicalJob & {
  readonly hydration: Extract<CanonicalJobHydration, { readonly _tag: "Hydrated" }>;
};

export const isHydrated = (job: CanonicalJob): job is HydratedCanonicalJob =>
  job.hydration._tag === "Hydrated";

/**
 * The vacancy as it stood at the moment a person saved or applied to it —
 * the frozen counterpart to `CanonicalJob`, which moves.
 *
 * `CanonicalJob` is the corpus's live view: an advert is edited in place
 * (`UpdatedCanonical`) and, once the corpus gains its prune sweep, can be
 * deleted outright after a year. Neither should be able to reach back and
 * change what a person's saved-job or application history says they saw —
 * that history is a historical fact, not a view onto the corpus row. Taking
 * a copy at the moment of saving is what makes that true by construction
 * rather than by nobody having pruned yet.
 *
 * Deliberately not every `CanonicalJob` field:
 * - `title`, `employerName`, `location`, `applicationUrl`, `publishedAt`,
 *   `deadline` are what a person needs to recognise and act on this entry a
 *   year later — the minimum the operator's brief asked for.
 * - `description` is also carried, not trimmed for size: `Drafting.compose`
 *   ranks a profile's experience and matches skills against the advert's
 *   text (`drafting/relevance.ts`'s `advertText`), and that ranking is what
 *   `Applications.prepare` uses to compose the actual CV and letter. Without
 *   it, an application could never be (re-)drafted once the corpus row it
 *   used to point at is gone — which is exactly the failure this type
 *   exists to prevent. A typical advert is a few hundred words; keeping it
 *   costs kilobytes per saved job, not a scaling problem for one person's
 *   history.
 * - `id`, `canonicalKey`, `sequence`, `changedAt`, `sources`, `status` are
 *   NOT carried: those describe the corpus's own bookkeeping (dedup key,
 *   change-stream position, provenance, whether the corpus still considers
 *   it open) — facts about the row, not about the vacancy as the person
 *   read it, and meaningless once that row is pruned. `canonicalJobId`
 *   stays on `SavedJob`/`ApplicationRecord` themselves, separately, for
 *   whatever can still usefully look the live row up (e.g. `Policy`) while
 *   it exists.
 */
export const JobSnapshot = Schema.Struct({
  title: Schema.String,
  employerName: Schema.String,
  location: Schema.String,
  description: Schema.String,
  applicationUrl: Schema.String,
  publishedAt: Schema.String,
  deadline: Schema.optional(Schema.String),
});
export type JobSnapshot = typeof JobSnapshot.Type;

/**
 * The frozen slice of a `CanonicalJob` a save or an application takes at the
 * moment it acts.
 *
 * Takes a `HydratedCanonicalJob`, not a plain `CanonicalJob`: a snapshot
 * exists so drafting can compose against `description` later with no second
 * corpus read, so a snapshot of an unhydrated vacancy — a description this
 * function does not have — is not a value this signature can produce. The
 * caller (`SavedJobs.save`) is the one place that must first prove the job
 * it holds is hydrated; see `design-specs/deferred-hydration.md`'s falsifier
 * 6 ("fails loudly ... rather than composing against an empty description").
 */
export const snapshotOf = (job: HydratedCanonicalJob): JobSnapshot => ({
  title: job.title,
  employerName: job.employerName,
  location: job.location,
  description: job.hydration.description,
  applicationUrl: job.applicationUrl,
  publishedAt: job.publishedAt,
  deadline: job.hydration.deadline,
});

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
  /**
   * A plain `TEXT NOT NULL` column even for an unhydrated row: it holds `""`
   * rather than SQL `NULL`, so the storage row needs no nullability change
   * of its own. `hydrationTag` is the single source of truth for whether
   * this value means anything; `rows.ts` is the one place that reads it and
   * decides. Reading `description` here without checking `hydrationTag`
   * first is the mistake this column's own shape cannot prevent — see
   * `CanonicalJob`'s `hydration` field for where that check is structural.
   */
  description: Schema.String,
  applicationUrl: Schema.String,
  publishedAt: Schema.String,
  deadline: Model.FieldOption(Schema.String),
  /** Flattened from `CanonicalJobHydration`'s tag, the same reason `statusTag` is flattened below. */
  hydrationTag: Schema.Literals(["Unhydrated", "Hydrated"]),
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
  /** Which adapter can re-fetch this occurrence's detail — see `RawListing.platformId`. */
  platformId: PlatformId,
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
