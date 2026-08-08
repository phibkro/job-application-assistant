/**
 * The fixed set of statements this slot sends through `Database`.
 *
 * Built from the domain models' field lists rather than typed out. A column
 * name appears in exactly one place — the `Model.Class` in `packages/domain`,
 * which `scripts/ts/schema.ts` also generates `db/schema.sql` from — so a
 * statement cannot name a column the table lacks, and adding a field cannot
 * leave a stale `INSERT` behind. `rows.ts` derives its binding order from the
 * same lists, so placeholders and values cannot drift apart either.
 *
 * They stay exported as named constants because `testSupport.ts`'s fake
 * `Database` recognises a statement by comparing against the *same* constant.
 * Only the text is generated; the identity is still shared.
 */
import { CanonicalJobRecord, OccurrenceRecord } from "@job-index/domain/Job";

export const CANONICAL_JOB_FIELDS = Object.keys(
  CanonicalJobRecord.select.fields,
) as ReadonlyArray<string>;

export const OCCURRENCE_FIELDS = Object.keys(
  OccurrenceRecord.select.fields,
) as ReadonlyArray<string>;

const columns = (fields: ReadonlyArray<string>): string => fields.join(", ");

const placeholders = (fields: ReadonlyArray<string>): string => fields.map(() => "?").join(", ");

const selectFrom = (table: string, fields: ReadonlyArray<string>, where: string): string =>
  `SELECT ${columns(fields)} FROM ${table} ${where}`;

const insertInto = (table: string, fields: ReadonlyArray<string>): string =>
  `INSERT INTO ${table} (${columns(fields)}) VALUES (${placeholders(fields)})`;

/** `key` moves to the end, matching `WHERE key = ?` and `updateBindings`. */
const update = (table: string, fields: ReadonlyArray<string>, key: string): string => {
  const assignments = fields
    .filter((field) => field !== key)
    .map((field) => `${field} = ?`)
    .join(", ");
  return `UPDATE ${table} SET ${assignments} WHERE ${key} = ?`;
};

export const SELECT_CANONICAL_JOB_BY_ID = selectFrom(
  "canonical_jobs",
  CANONICAL_JOB_FIELDS,
  "WHERE id = ?",
);

export const SELECT_NEXT_SEQUENCE = `SELECT COALESCE(MAX(sequence), 0) + 1 AS nextSequence FROM canonical_jobs`;

export const INSERT_CANONICAL_JOB = insertInto("canonical_jobs", CANONICAL_JOB_FIELDS);

export const UPDATE_CANONICAL_JOB = update("canonical_jobs", CANONICAL_JOB_FIELDS, "id");

export const SELECT_OCCURRENCE_BY_ID = selectFrom("occurrences", OCCURRENCE_FIELDS, "WHERE id = ?");

export const INSERT_OCCURRENCE = insertInto("occurrences", OCCURRENCE_FIELDS);

export const UPDATE_OCCURRENCE = update("occurrences", OCCURRENCE_FIELDS, "id");

export const SELECT_CANONICAL_JOBS_CHANGED_SINCE = selectFrom(
  "canonical_jobs",
  CANONICAL_JOB_FIELDS,
  "WHERE sequence > ? ORDER BY sequence ASC LIMIT ?",
);

/** Fresh, per profile: unseen and still `Active` — offering a closed vacancy serves nobody. */
export const SELECT_FRESH_CANONICAL_JOBS = selectFrom(
  "canonical_jobs",
  CANONICAL_JOB_FIELDS,
  "WHERE sequence > ? AND statusTag = 'Active' ORDER BY sequence DESC LIMIT ?",
);

/**
 * Everything a source is currently believed to be advertising.
 *
 * `closeAbsent` compares this against what a completed collection run
 * actually saw. It reads the whole active set rather than passing the seen
 * ids into a `NOT IN (...)` list, because that list is unbounded — a source
 * with ten thousand adverts would need ten thousand placeholders, and D1
 * limits how many a statement may carry.
 */
export const SELECT_ACTIVE_OCCURRENCES_BY_SOURCE = selectFrom(
  "occurrences",
  OCCURRENCE_FIELDS,
  "WHERE sourceId = ? AND active = 1",
);

export const DEACTIVATE_OCCURRENCE = `UPDATE occurrences SET active = 0 WHERE id = ?`;

/**
 * Which occurrence `Hydration.hydrate` should fetch detail through, for a
 * canonical job that has more than one active source.
 *
 * `firstSeenAt ASC` picks the source that told us about this vacancy first
 * — an arbitrary but *stable* tiebreak (the same occurrence every time, so a
 * retried hydration always targets the same adapter rather than a different
 * one each attempt) rather than one this slot invents fresh per query.
 */
export const SELECT_ACTIVE_OCCURRENCE_BY_CANONICAL_JOB = selectFrom(
  "occurrences",
  OCCURRENCE_FIELDS,
  "WHERE canonicalJobId = ? AND active = 1 ORDER BY firstSeenAt ASC LIMIT 1",
);

/**
 * Whether any source still advertises this vacancy. A canonical job closes
 * only when the count reaches zero: one platform dropping an advert that
 * another still carries is not a closure.
 */
export const COUNT_ACTIVE_OCCURRENCES = `SELECT COUNT(*) AS activeCount FROM occurrences WHERE canonicalJobId = ? AND active = 1`;

/**
 * `search`'s WHERE clause, composed per request from which of
 * term/location/status the caller supplied. Still a fixed, enumerable
 * shape — three optional predicates is eight variants, not an open-ended
 * builder — it just cannot be one named constant the way the statements
 * above are, since which predicates apply is itself the input.
 *
 * `sequence > ?` plus `ORDER BY sequence ASC` is the same cursor
 * `SELECT_CANONICAL_JOBS_CHANGED_SINCE` walks, and for the same reason:
 * `sequence` is assigned once per write (`SELECT_NEXT_SEQUENCE`) and is
 * therefore already unique across the table, so it is a total order on its
 * own — no second tiebreak column is needed to keep two rows from ever
 * comparing equal.
 *
 * `titleNormalized`/`employerNameNormalized`/`locationNormalized` are
 * folded once at observe time (see `rows.ts`); `corpus/search.ts` folds an
 * incoming term/location the same way before binding it, so the `LIKE`
 * comparison is between two already-folded strings and never asks SQLite's
 * ASCII-only case folding to do anything with `Ø`/`ø`.
 */
export const SEARCH_CANONICAL_JOBS = (filter: {
  readonly term: boolean;
  readonly location: boolean;
  readonly status: boolean;
}): string => {
  const predicates = ["sequence > ?"];
  if (filter.term) {
    predicates.push(
      "(titleNormalized LIKE ? ESCAPE '\\' OR employerNameNormalized LIKE ? ESCAPE '\\')",
    );
  }
  if (filter.location) {
    predicates.push("locationNormalized LIKE ? ESCAPE '\\'");
  }
  if (filter.status) {
    predicates.push("statusTag = ?");
  }
  return selectFrom(
    "canonical_jobs",
    CANONICAL_JOB_FIELDS,
    `WHERE ${predicates.join(" AND ")} ORDER BY sequence ASC LIMIT ?`,
  );
};

export const SELECT_FRESHNESS_BY_PROFILE = `SELECT profileId, seenThrough, updatedAt FROM freshness WHERE profileId = ?`;

export const INSERT_FRESHNESS = `INSERT INTO freshness (profileId, seenThrough, updatedAt) VALUES (?, ?, ?)`;

export const UPDATE_FRESHNESS = `UPDATE freshness SET seenThrough = ?, updatedAt = ? WHERE profileId = ?`;
