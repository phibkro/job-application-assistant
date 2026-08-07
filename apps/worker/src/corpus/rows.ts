import type { CanonicalJob } from "@job-index/domain/Job";
import type { CanonicalJobId, OccurrenceId, SourceId, Sequence } from "@job-index/domain/Ids";

/**
 * The flat shape `canonical_jobs` rows take over `Database.query`/`run`.
 *
 * `Database` promises nothing about how a query is built — "the only module
 * that knows SQL" — so somewhere the object shape a `CanonicalJob` needs and
 * the flat row shape SQLite hands back must be reconciled. This is that one
 * place, kept pure and separate from anything that touches `Database` itself
 * so it is testable with plain objects.
 */
export interface CanonicalJobRow {
  readonly id: string;
  readonly canonicalKey: string;
  readonly title: string;
  readonly employerName: string;
  readonly location: string;
  readonly description: string;
  readonly applicationUrl: string;
  readonly publishedAt: string;
  readonly deadline: string | null;
  readonly statusTag: "Active" | "Closed";
  readonly statusClosedAt: string | null;
  readonly sequence: number;
  readonly changedAt: string;
  /** JSON-encoded `ReadonlyArray<SourceId>` — SQLite has no array column type. */
  readonly sources: string;
}

/** One source's advert against one canonical job, with its own lifecycle. */
export interface OccurrenceRow {
  readonly id: string;
  readonly canonicalJobId: string;
  readonly sourceId: string;
  readonly externalId: string;
  readonly contentFingerprint: string;
  readonly firstSeenAt: string;
  readonly lastSeenAt: string;
}

export const canonicalJobFromRow = (row: CanonicalJobRow): CanonicalJob => ({
  id: row.id as CanonicalJobId,
  title: row.title,
  employerName: row.employerName,
  location: row.location,
  description: row.description,
  applicationUrl: row.applicationUrl,
  publishedAt: row.publishedAt,
  deadline: row.deadline ?? undefined,
  status:
    row.statusTag === "Closed"
      ? { _tag: "Closed", closedAt: row.statusClosedAt ?? "" }
      : { _tag: "Active" },
  sequence: row.sequence as Sequence,
  changedAt: row.changedAt,
  sources: JSON.parse(row.sources) as ReadonlyArray<SourceId>,
});

export const rowFromCanonicalJob = (job: CanonicalJob, canonicalKey: string): CanonicalJobRow => ({
  id: job.id,
  canonicalKey,
  title: job.title,
  employerName: job.employerName,
  location: job.location,
  description: job.description,
  applicationUrl: job.applicationUrl,
  publishedAt: job.publishedAt,
  deadline: job.deadline ?? null,
  statusTag: job.status._tag,
  statusClosedAt: job.status._tag === "Closed" ? job.status.closedAt : null,
  sequence: job.sequence,
  changedAt: job.changedAt,
  sources: JSON.stringify(job.sources),
});

/** One occurrence record, whichever direction it is flowing. */
export interface OccurrenceRecord {
  readonly id: OccurrenceId;
  readonly canonicalJobId: CanonicalJobId;
  readonly sourceId: SourceId;
  readonly externalId: string;
  readonly contentFingerprint: string;
  readonly firstSeenAt: string;
  readonly lastSeenAt: string;
}

export const occurrenceFromRow = (row: OccurrenceRow): OccurrenceRecord => ({
  id: row.id as OccurrenceId,
  canonicalJobId: row.canonicalJobId as CanonicalJobId,
  sourceId: row.sourceId as SourceId,
  externalId: row.externalId,
  contentFingerprint: row.contentFingerprint,
  firstSeenAt: row.firstSeenAt,
  lastSeenAt: row.lastSeenAt,
});

export const rowFromOccurrence = (record: OccurrenceRecord): OccurrenceRow => ({
  id: record.id,
  canonicalJobId: record.canonicalJobId,
  sourceId: record.sourceId,
  externalId: record.externalId,
  contentFingerprint: record.contentFingerprint,
  firstSeenAt: record.firstSeenAt,
  lastSeenAt: record.lastSeenAt,
});

/**
 * Positional bindings, ordered to match `sql.ts`'s placeholders exactly.
 * Kept next to the row shape they serialise rather than beside the SQL, so a
 * field added to `CanonicalJobRow` and a field added to its binding order
 * cannot drift silently out of sync with each other.
 */
export const insertCanonicalJobBindings = (row: CanonicalJobRow): ReadonlyArray<unknown> => [
  row.id,
  row.canonicalKey,
  row.title,
  row.employerName,
  row.location,
  row.description,
  row.applicationUrl,
  row.publishedAt,
  row.deadline,
  row.statusTag,
  row.statusClosedAt,
  row.sequence,
  row.changedAt,
  row.sources,
];

export const updateCanonicalJobBindings = (row: CanonicalJobRow): ReadonlyArray<unknown> => [
  row.canonicalKey,
  row.title,
  row.employerName,
  row.location,
  row.description,
  row.applicationUrl,
  row.publishedAt,
  row.deadline,
  row.statusTag,
  row.statusClosedAt,
  row.sequence,
  row.changedAt,
  row.sources,
  row.id,
];

export const insertOccurrenceBindings = (row: OccurrenceRow): ReadonlyArray<unknown> => [
  row.id,
  row.canonicalJobId,
  row.sourceId,
  row.externalId,
  row.contentFingerprint,
  row.firstSeenAt,
  row.lastSeenAt,
];

export const updateOccurrenceBindings = (row: OccurrenceRow): ReadonlyArray<unknown> => [
  row.canonicalJobId,
  row.sourceId,
  row.externalId,
  row.contentFingerprint,
  row.firstSeenAt,
  row.lastSeenAt,
  row.id,
];
