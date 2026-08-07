import * as Effect from "effect/Effect";
import * as DateTime from "effect/DateTime";
import type { ObservationOutcome } from "@job-index/domain/Job";
import type { SourceId } from "@job-index/domain/Ids";
import type { DatabaseShape } from "./databaseShape.ts";
import { absentOccurrences, closeCanonical } from "./decide.ts";
import { canonicalJobFromRow, occurrenceFromRow, rowFromCanonicalJob } from "./rows.ts";
import type { CanonicalJobRow, OccurrenceRow } from "./rows.ts";
import { updateCanonicalJobBindings } from "./rows.ts";
import {
  COUNT_ACTIVE_OCCURRENCES,
  DEACTIVATE_OCCURRENCE,
  SELECT_ACTIVE_OCCURRENCES_BY_SOURCE,
  SELECT_CANONICAL_JOB_BY_ID,
  SELECT_NEXT_SEQUENCE,
  UPDATE_CANONICAL_JOB,
} from "./sql.ts";

interface CountRow {
  readonly activeCount: number;
}

interface NextSequenceRow {
  readonly nextSequence: number;
}

/**
 * Corpus.closeAbsent: the sweep that makes `ClosedCanonical` reachable.
 *
 * `observe` folds in one sighting at a time and therefore can never close
 * anything — a closure is an *absence*, and no single positive observation
 * carries one. Only a caller that finished enumerating a source knows what it
 * did not find, which is why the seen ids arrive as an argument rather than
 * being inferred here.
 *
 * The rule it implements: an occurrence the source no longer advertises goes
 * inactive; a canonical job whose last active occurrence disappears closes.
 * A vacancy still carried by another platform stays open, which is the whole
 * reason occurrences are kept per source instead of merged away.
 *
 * Runs inside `database.transaction` for the same reason `observe` does: a
 * crash between deactivating the last occurrence and closing its canonical
 * job would leave a vacancy that no source advertises and no reader can tell
 * is gone.
 */
export const makeCloseAbsent =
  (database: DatabaseShape) =>
  (
    source: SourceId,
    seenExternalIds: ReadonlyArray<string>,
  ): Effect.Effect<ReadonlyArray<ObservationOutcome>> =>
    database.transaction(
      Effect.gen(function* () {
        const activeRows = yield* database.query<OccurrenceRow>(
          SELECT_ACTIVE_OCCURRENCES_BY_SOURCE,
          [source],
        );
        const absent = absentOccurrences(activeRows.map(occurrenceFromRow), seenExternalIds);
        if (absent.length === 0) {
          return [];
        }

        const now = DateTime.formatIso(yield* DateTime.now);
        const sequenceRows = yield* database.query<NextSequenceRow>(SELECT_NEXT_SEQUENCE, []);
        let nextSequence = sequenceRows[0]?.nextSequence ?? 1;
        const outcomes: Array<ObservationOutcome> = [];

        for (const occurrence of absent) {
          yield* database.run(DEACTIVATE_OCCURRENCE, [occurrence.id]);
        }

        // Distinct, because two adverts from this same source may point at one
        // canonical job; closing it twice would burn two sequence numbers and
        // report the same closure to a saved search twice.
        const affected = new Set(absent.map((occurrence) => occurrence.canonicalJobId));
        for (const jobId of affected) {
          const remaining = yield* database.query<CountRow>(COUNT_ACTIVE_OCCURRENCES, [jobId]);
          if ((remaining[0]?.activeCount ?? 0) > 0) {
            continue;
          }
          const jobRows = yield* database.query<CanonicalJobRow>(SELECT_CANONICAL_JOB_BY_ID, [
            jobId,
          ]);
          if (jobRows[0] === undefined) {
            continue;
          }
          const job = canonicalJobFromRow(jobRows[0]);
          if (job.status._tag === "Closed") {
            continue;
          }
          const closed = closeCanonical(job, nextSequence, now);
          nextSequence += 1;
          yield* database.run(
            UPDATE_CANONICAL_JOB,
            updateCanonicalJobBindings(rowFromCanonicalJob(closed, jobRows[0].canonicalKey)),
          );
          outcomes.push({ _tag: "ClosedCanonical", id: closed.id });
        }

        return outcomes;
      }),
    );
