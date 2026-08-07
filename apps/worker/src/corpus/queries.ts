import * as Effect from "effect/Effect";
import type { CanonicalJob } from "@job-index/domain/Job";
import type { CanonicalJobId, Sequence } from "@job-index/domain/Ids";
import type { DatabaseShape } from "./databaseShape.ts";
import { canonicalJobFromRow, type CanonicalJobRow } from "./rows.ts";
import { SELECT_CANONICAL_JOB_BY_ID, SELECT_CANONICAL_JOBS_CHANGED_SINCE } from "./sql.ts";

/** Corpus.get: one canonical job by id, or `undefined` — never a failure, an absent id is not exceptional. */
export const makeGet =
  (database: DatabaseShape) =>
  (id: CanonicalJobId): Effect.Effect<CanonicalJob | undefined> =>
    Effect.map(database.query<CanonicalJobRow>(SELECT_CANONICAL_JOB_BY_ID, [id]), (rows) =>
      rows[0] === undefined ? undefined : canonicalJobFromRow(rows[0]),
    );

/**
 * Corpus.changedSince: the incremental change stream a saved search walks.
 * Ascending order, unlike `fresh`'s newest-first — a saved search resumes
 * from its last-seen sequence and must process gaps in the order they
 * happened, not newest first.
 */
export const makeChangedSince =
  (database: DatabaseShape) =>
  (sequence: Sequence, limit: number): Effect.Effect<ReadonlyArray<CanonicalJob>> =>
    Effect.map(
      database.query<CanonicalJobRow>(SELECT_CANONICAL_JOBS_CHANGED_SINCE, [sequence, limit]),
      (rows) => rows.map(canonicalJobFromRow),
    );
