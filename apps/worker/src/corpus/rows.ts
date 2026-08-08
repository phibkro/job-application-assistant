import type {
  CanonicalJobRecord,
  OccurrenceRecord as OccurrenceModel,
} from "@job-index/domain/Job";
import type { CanonicalJob } from "@job-index/domain/Job";
import type {
  CanonicalJobId,
  OccurrenceId,
  PlatformId,
  SourceId,
  Sequence,
} from "@job-index/domain/Ids";
import { normalizeText } from "./identity.ts";
import { CANONICAL_JOB_FIELDS, OCCURRENCE_FIELDS } from "./sql.ts";

/**
 * The flat shapes rows take over `Database.query`/`run`.
 *
 * Read off the domain models' *encoded* side rather than restated: that is
 * precisely what a `Model.Class` encodes to, and it is the same declaration
 * `db/schema.sql` is generated from. A column added to the model appears here
 * without an edit, and a row shape that disagrees with the table is no longer
 * expressible.
 *
 * `Database` promises nothing about how a query is built — "the only module
 * that knows SQL" — so somewhere the object shape a `CanonicalJob` needs and
 * the flat row SQLite hands back must be reconciled. This is that one place,
 * kept pure and separate from anything that touches `Database` itself.
 */
export type CanonicalJobRow = typeof CanonicalJobRecord.select.Encoded;

/** One source's advert against one canonical job, with its own lifecycle. */
export type OccurrenceRow = typeof OccurrenceModel.select.Encoded;

export const canonicalJobFromRow = (row: CanonicalJobRow): CanonicalJob => ({
  id: row.id as CanonicalJobId,
  title: row.title,
  employerName: row.employerName,
  location: row.location,
  applicationUrl: row.applicationUrl,
  publishedAt: row.publishedAt,
  status:
    row.statusTag === "Closed"
      ? { _tag: "Closed", closedAt: row.statusClosedAt ?? "" }
      : { _tag: "Active" },
  sequence: row.sequence as Sequence,
  changedAt: row.changedAt,
  sources: JSON.parse(row.sources) as ReadonlyArray<SourceId>,
  // `description`/`deadline` are read only behind the `hydrationTag` gate:
  // an `Unhydrated` row's `description` column is `""` by convention (see
  // `CanonicalJobRecord`'s own doc comment), never surfaced as if it meant
  // something.
  hydration:
    row.hydrationTag === "Hydrated"
      ? { _tag: "Hydrated", description: row.description, deadline: row.deadline ?? undefined }
      : { _tag: "Unhydrated" },
});

export const rowFromCanonicalJob = (job: CanonicalJob, canonicalKey: string): CanonicalJobRow => ({
  id: job.id,
  canonicalKey,
  title: job.title,
  employerName: job.employerName,
  location: job.location,
  description: job.hydration._tag === "Hydrated" ? job.hydration.description : "",
  applicationUrl: job.applicationUrl,
  publishedAt: job.publishedAt,
  deadline: job.hydration._tag === "Hydrated" ? (job.hydration.deadline ?? null) : null,
  hydrationTag: job.hydration._tag,
  statusTag: job.status._tag,
  statusClosedAt: job.status._tag === "Closed" ? job.status.closedAt : null,
  sequence: job.sequence,
  changedAt: job.changedAt,
  sources: JSON.stringify(job.sources),
  titleNormalized: normalizeText(job.title),
  employerNameNormalized: normalizeText(job.employerName),
  locationNormalized: normalizeText(job.location),
});

/** One occurrence record, whichever direction it is flowing. */
export interface OccurrenceRecord {
  readonly id: OccurrenceId;
  readonly canonicalJobId: CanonicalJobId;
  readonly sourceId: SourceId;
  readonly platformId: PlatformId;
  readonly externalId: string;
  readonly contentFingerprint: string;
  /** Whether the source still advertises it; see `OccurrenceModel.active`. */
  readonly active: boolean;
  readonly firstSeenAt: string;
  readonly lastSeenAt: string;
}

export const occurrenceFromRow = (row: OccurrenceRow): OccurrenceRecord => ({
  id: row.id as OccurrenceId,
  canonicalJobId: row.canonicalJobId as CanonicalJobId,
  sourceId: row.sourceId as SourceId,
  platformId: row.platformId as PlatformId,
  externalId: row.externalId,
  contentFingerprint: row.contentFingerprint,
  active: row.active === 1,
  firstSeenAt: row.firstSeenAt,
  lastSeenAt: row.lastSeenAt,
});

export const rowFromOccurrence = (record: OccurrenceRecord): OccurrenceRow => ({
  id: record.id,
  canonicalJobId: record.canonicalJobId,
  sourceId: record.sourceId,
  platformId: record.platformId,
  externalId: record.externalId,
  contentFingerprint: record.contentFingerprint,
  active: record.active ? 1 : 0,
  firstSeenAt: record.firstSeenAt,
  lastSeenAt: record.lastSeenAt,
});

/**
 * Positional bindings, ordered by the same field lists `sql.ts` builds its
 * placeholders from. Hand-written binding arrays were the other half of the
 * drift this slot could suffer: a column added to the statement and forgotten
 * here shifted every value after it, silently. Now there is one order.
 */
const bindingsFor = (
  row: Record<string, unknown>,
  fields: ReadonlyArray<string>,
): ReadonlyArray<unknown> => fields.map((field) => row[field]);

/** `key` last, matching `UPDATE ... WHERE key = ?`. */
const updateBindingsFor = (
  row: Record<string, unknown>,
  fields: ReadonlyArray<string>,
  key: string,
): ReadonlyArray<unknown> => [
  ...fields.filter((field) => field !== key).map((field) => row[field]),
  row[key],
];

export const insertCanonicalJobBindings = (row: CanonicalJobRow): ReadonlyArray<unknown> =>
  bindingsFor(row, CANONICAL_JOB_FIELDS);

export const updateCanonicalJobBindings = (row: CanonicalJobRow): ReadonlyArray<unknown> =>
  updateBindingsFor(row, CANONICAL_JOB_FIELDS, "id");

export const insertOccurrenceBindings = (row: OccurrenceRow): ReadonlyArray<unknown> =>
  bindingsFor(row, OCCURRENCE_FIELDS);

export const updateOccurrenceBindings = (row: OccurrenceRow): ReadonlyArray<unknown> =>
  updateBindingsFor(row, OCCURRENCE_FIELDS, "id");
