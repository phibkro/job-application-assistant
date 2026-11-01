import * as Effect from "effect/Effect";
import {
  occurrenceKey,
  projectJobs,
  rebuild as rebuildRows,
} from "@job-index/domain/observation/Projection";
import type { Membership, WorkloadRow } from "@job-index/domain/observation/Projection";
import { Database } from "../services/Database.ts";
import type { Write } from "../services/Database.ts";
import * as Store from "./store.ts";

/**
 * Maintenance of the rebuildable `workload_projection` (WS-0022 §6), at the edge. The rows are computed by the pure
 * `Projection.projectJobs`/`rebuild`; this module only reads their inputs and writes their outputs.
 *
 * Membership (which vacancy an occurrence belongs to) is read from the corpus's `occurrences` table, so the projection
 * follows today's identity (D05 pinned by WS-0020 T4). TB-02 replaces that input, not this module.
 */

interface MembershipRow {
  readonly sourceId: string;
  readonly externalId: string;
  readonly canonicalJobId: string;
}

const MEMBERSHIP_OF_OCCURRENCES = `SELECT c.sourceId, c.externalId, c.canonicalJobId
FROM json_each(?) AS j
JOIN occurrences AS c ON c.sourceId = json_extract(j.value, '$[0]') AND c.externalId = json_extract(j.value, '$[1]')`;

const MEMBERSHIP_OF_JOBS = `SELECT c.sourceId, c.externalId, c.canonicalJobId
FROM json_each(?) AS j
JOIN occurrences AS c ON c.canonicalJobId = j.value`;

const ALL_MEMBERSHIP = "SELECT sourceId, externalId, canonicalJobId FROM occurrences";

const UPSERT_ROW = `INSERT INTO workload_projection (canonicalJobId, workloadState, workloadMin, workloadMax, workloadMethod)
VALUES (?, ?, ?, ?, ?)
ON CONFLICT (canonicalJobId) DO UPDATE SET
  workloadState = excluded.workloadState,
  workloadMin = excluded.workloadMin,
  workloadMax = excluded.workloadMax,
  workloadMethod = excluded.workloadMethod`;

const SELECT_ROWS = `SELECT p.canonicalJobId, p.workloadState, p.workloadMin, p.workloadMax, p.workloadMethod
FROM json_each(?) AS j
JOIN workload_projection AS p ON p.canonicalJobId = j.value`;

const SELECT_ALL_ROWS =
  "SELECT canonicalJobId, workloadState, workloadMin, workloadMax, workloadMethod FROM workload_projection ORDER BY canonicalJobId";

const membershipOf = (rows: ReadonlyArray<MembershipRow>): Membership =>
  new Map(
    rows.map((row) => [occurrenceKey(row.sourceId, row.externalId), row.canonicalJobId] as const),
  );

const upsert = (row: WorkloadRow): Write => ({
  sql: UPSERT_ROW,
  bindings: [
    row.canonicalJobId,
    row.workloadState,
    row.workloadMin,
    row.workloadMax,
    row.workloadMethod,
  ],
});

/**
 * Incremental refresh after a batch: recompute only the vacancies the batch's occurrences belong to, from every
 * observation of every member occurrence of those vacancies. Occurrences the corpus has not seen (e.g. NAV's INACTIVE
 * feed entries, which never became listings) belong to no vacancy and touch nothing.
 */
export const refresh = (
  batch: ReadonlyArray<{ readonly source: string; readonly externalId: string }>,
): Effect.Effect<ReadonlyArray<WorkloadRow>, never, Database> =>
  Effect.gen(function* () {
    if (batch.length === 0) return [];
    const database = yield* Database;
    const touched = [
      ...new Map(
        batch.map(
          (o) =>
            [occurrenceKey(o.source, o.externalId), [o.source, o.externalId] as const] as const,
        ),
      ).values(),
    ];
    const direct = yield* database.query<MembershipRow>(MEMBERSHIP_OF_OCCURRENCES, [
      JSON.stringify(touched),
    ]);
    const jobIds = [...new Set(direct.map((row) => row.canonicalJobId))];
    if (jobIds.length === 0) return [];
    const members = yield* database.query<MembershipRow>(MEMBERSHIP_OF_JOBS, [
      JSON.stringify(jobIds),
    ]);
    const observations = yield* Store.forOccurrences(
      members.map((row) => [row.sourceId, row.externalId] as const),
    );
    const rows = projectJobs(jobIds, observations, membershipOf(members));
    yield* database.atomic(rows.map(upsert));
    return rows;
  });

/** Full rebuild from every stored observation: the projection is disposable, the observations are not. */
export const rebuild: Effect.Effect<ReadonlyArray<WorkloadRow>, never, Database> = Effect.gen(
  function* () {
    const database = yield* Database;
    const membership = membershipOf(yield* database.query<MembershipRow>(ALL_MEMBERSHIP, []));
    const rows = rebuildRows(yield* Store.all, membership);
    yield* database.atomic([
      { sql: "DELETE FROM workload_projection", bindings: [] },
      ...rows.map(upsert),
    ]);
    return rows;
  },
);

export const rowsFor = (
  canonicalJobIds: ReadonlyArray<string>,
): Effect.Effect<ReadonlyMap<string, WorkloadRow>, never, Database> =>
  Effect.gen(function* () {
    if (canonicalJobIds.length === 0) return new Map();
    const database = yield* Database;
    const rows = yield* database.query<WorkloadRow>(SELECT_ROWS, [JSON.stringify(canonicalJobIds)]);
    return new Map(rows.map((row) => [row.canonicalJobId, row] as const));
  });

export const allRows: Effect.Effect<ReadonlyArray<WorkloadRow>, never, Database> = Effect.gen(
  function* () {
    const database = yield* Database;
    return yield* database.query<WorkloadRow>(SELECT_ALL_ROWS, []);
  },
);
