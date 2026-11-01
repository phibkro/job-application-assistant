import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import {
  decodeObservationContent,
  encodeObservationContent,
  observationId,
} from "@job-index/domain/observation/Ir";
import type { ListingObservation, ObservationContent } from "@job-index/domain/observation/Ir";
import type { ObservationRow } from "@job-index/domain/observation/Rows";
import { Database } from "../services/Database.ts";
import type { Write } from "../services/Database.ts";

/**
 * The append-only observation store (WS-0022 §3), at the edge: SQL and `Database` only, every decision in the pure
 * core (`@job-index/domain/observation/*`). Append-only is the database's guarantee, not this module's: triggers
 * (migration 0006) reject `UPDATE`, `DELETE` and any `INSERT` that would overwrite a row (`INSERT OR REPLACE`
 * included), and reject a `recordedSeq` that does not exceed every sequence ever issued. `purge` is the one path
 * through, and its tombstone keeps the purged sequence.
 */

export interface Recording {
  readonly runId: string;
  readonly recordedAt: string;
}

/**
 * Content-addressed insert. `ON CONFLICT (id) DO NOTHING`, not `INSERT OR IGNORE`: OR IGNORE would also swallow a
 * `CHECK`/`NOT NULL` violation, and a malformed row must fail loudly. The recorded sequence is assigned inside the
 * statement, so a batch numbers its rows in order and a replayed row consumes no number. The next number is one past
 * every sequence ever issued, so it reads the tombstones too: a purged row's number is never reused (review R1;
 * `observations_seq_monotone` rejects anything else).
 */
const INSERT_OBSERVATION = `INSERT INTO observations (id, irVersion, sourceId, externalId, kind, status, dateModified, recordedSeq, recordedAt, runId, payload)
VALUES (?, ?, ?, ?, ?, ?, ?, MAX(COALESCE((SELECT MAX(recordedSeq) FROM observations), 0), COALESCE((SELECT MAX(recordedSeq) FROM observation_tombstones), 0)) + 1, ?, ?, ?)
ON CONFLICT (id) DO NOTHING`;

const SELECT_COLUMNS =
  "id, irVersion, sourceId, externalId, kind, status, dateModified, recordedSeq, recordedAt, runId, payload";

const SELECT_ALL = `SELECT ${SELECT_COLUMNS} FROM observations ORDER BY recordedSeq`;

/** `json_each` drives the loop, so the `(sourceId, externalId)` index serves each lookup. */
const SELECT_FOR_OCCURRENCES = `SELECT o.id, o.irVersion, o.sourceId, o.externalId, o.kind, o.status, o.dateModified, o.recordedSeq, o.recordedAt, o.runId, o.payload
FROM json_each(?) AS j
JOIN observations AS o ON o.sourceId = json_extract(j.value, '$[0]') AND o.externalId = json_extract(j.value, '$[1]')
ORDER BY o.recordedSeq`;

const MAX_SEQ = "SELECT COALESCE(MAX(recordedSeq), 0) AS seq FROM observations";

/**
 * Bounded-hydration candidates (option A): occurrences of `source` whose latest recorded observation is an ACTIVE feed
 * entry and that have no detail (or status-only) observation yet, most recently recorded first, so the page this run
 * just committed is hydrated first. A selection heuristic, not a fact: it decides only what to fetch next.
 */
const SELECT_HYDRATION_CANDIDATES = `SELECT o.externalId AS externalId
FROM observations AS o
WHERE o.sourceId = ?
GROUP BY o.sourceId, o.externalId
HAVING SUM(CASE WHEN o.kind IN ('Detail', 'StatusOnly') THEN 1 ELSE 0 END) = 0
  AND (SELECT latest.status FROM observations AS latest
       WHERE latest.sourceId = o.sourceId AND latest.externalId = o.externalId
       ORDER BY latest.recordedSeq DESC LIMIT 1) = 'ACTIVE'
ORDER BY MAX(o.recordedSeq) DESC
LIMIT ?`;

const INSERT_TOMBSTONE = `INSERT INTO observation_tombstones (observationId, sourceId, externalId, recordedSeq, reason, purgedAt)
SELECT id, sourceId, externalId, recordedSeq, ?, ? FROM observations WHERE id = ?`;

const DELETE_OBSERVATION = "DELETE FROM observations WHERE id = ?";

const insertWrite = (
  content: ObservationContent,
  recording: Recording,
  idOf: (content: ObservationContent) => string,
): Write => ({
  sql: INSERT_OBSERVATION,
  bindings: [
    idOf(content),
    content.irVersion,
    content.source,
    content.externalId,
    content.kind,
    content.status,
    content.dateModified ?? null,
    recording.recordedAt,
    recording.runId,
    JSON.stringify(encodeObservationContent(content)),
  ],
});

/**
 * Appends observations in one batch. Returns how many were new: 0 means the batch was a semantic no-op (F2).
 * `idOf` defaults to the content address; it is a parameter only so F7's control C2 can swap it.
 */
export const append = (
  contents: ReadonlyArray<ObservationContent>,
  recording: Recording,
  idOf: (content: ObservationContent) => string = observationId,
): Effect.Effect<number, never, Database> =>
  Effect.gen(function* () {
    if (contents.length === 0) return 0;
    const database = yield* Database;
    const counts = yield* database.atomicAffected(
      contents.map((c) => insertWrite(c, recording, idOf)),
    );
    return counts.reduce((sum, count) => sum + count, 0);
  });

/** A stored row as the IR. A row that no longer decodes is a defect: it was validated when written. */
export const fromRow = (row: ObservationRow): ListingObservation => {
  const decoded = decodeObservationContent(JSON.parse(row.payload));
  if (Result.isFailure(decoded)) {
    throw new Error(
      `observation ${row.id} no longer decodes as the IR: ${decoded.failure.message}`,
    );
  }
  return {
    id: row.id,
    content: decoded.success,
    recorded: { recordedSeq: row.recordedSeq, recordedAt: row.recordedAt, runId: row.runId },
  };
};

/** `Effect.sync`: a row that does not decode throws inside it, which is a defect, as it should be. */
const decodeRows = (
  rows: ReadonlyArray<ObservationRow>,
): Effect.Effect<ReadonlyArray<ListingObservation>> => Effect.sync(() => rows.map(fromRow));

export const all: Effect.Effect<ReadonlyArray<ListingObservation>, never, Database> = Effect.gen(
  function* () {
    const database = yield* Database;
    return yield* decodeRows(yield* database.query<ObservationRow>(SELECT_ALL, []));
  },
);

export const forOccurrences = (
  occurrences: ReadonlyArray<readonly [string, string]>,
): Effect.Effect<ReadonlyArray<ListingObservation>, never, Database> =>
  Effect.gen(function* () {
    if (occurrences.length === 0) return [];
    const database = yield* Database;
    const rows = yield* database.query<ObservationRow>(SELECT_FOR_OCCURRENCES, [
      JSON.stringify(occurrences),
    ]);
    return yield* decodeRows(rows);
  });

export const maxRecordedSeq: Effect.Effect<number, never, Database> = Effect.gen(function* () {
  const database = yield* Database;
  const rows = yield* database.query<{ readonly seq: number }>(MAX_SEQ, []);
  return rows[0]?.seq ?? 0;
});

export const hydrationCandidates = (
  source: string,
  limit: number,
): Effect.Effect<ReadonlyArray<string>, never, Database> =>
  Effect.gen(function* () {
    if (limit <= 0) return [];
    const database = yield* Database;
    const rows = yield* database.query<{ readonly externalId: string }>(
      SELECT_HYDRATION_CANDIDATES,
      [source, limit],
    );
    return rows.map((row) => row.externalId);
  });

/**
 * The one lawful purge path: the tombstone and the delete commit together, and the delete trigger admits only a
 * tombstoned row. Re-inserting the same content afterwards is silently ignored (`observations_no_resurrection`).
 */
export const purge = (
  id: string,
  reason: string,
  purgedAt: string,
): Effect.Effect<boolean, never, Database> =>
  Effect.gen(function* () {
    const database = yield* Database;
    const [tombstoned = 0] = yield* database.atomicAffected([
      { sql: INSERT_TOMBSTONE, bindings: [reason, purgedAt, id] },
      { sql: DELETE_OBSERVATION, bindings: [id] },
    ]);
    return tombstoned > 0;
  });
