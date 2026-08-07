import * as Effect from "effect/Effect";
import * as DateTime from "effect/DateTime";
import type { ObservationOutcome } from "@job-index/domain/Job";
import type { SourceId } from "@job-index/domain/Ids";
import type { Write } from "../services/Database.ts";
import type { DatabaseShape } from "./databaseShape.ts";
import { absentOccurrences, closeCanonical } from "./decide.ts";
import {
  canonicalJobFromRow,
  occurrenceFromRow,
  rowFromCanonicalJob,
  updateCanonicalJobBindings,
} from "./rows.ts";
import type { CanonicalJobRow, OccurrenceRow } from "./rows.ts";
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
 * inactive; a canonical job whose last active occurrence disappears closes. A
 * vacancy still carried by another platform stays open, which is the whole
 * reason occurrences are kept per source instead of merged away.
 *
 * Every read happens before any write, and the writes go out as one batch.
 * That is not only what `Database.atomic` accepts — it is the only correct
 * order. The first draft of this function deactivated occurrences and then
 * counted the survivors, which is right against SQLite and wrong against D1,
 * where the count would not see the deactivations and every affected vacancy
 * would stay open forever. So the survivors are counted first, and which
 * vacancies that closes is decided from those counts rather than re-read.
 */
export const makeCloseAbsent =
  (database: DatabaseShape) =>
  (
    source: SourceId,
    seenExternalIds: ReadonlyArray<string>,
  ): Effect.Effect<ReadonlyArray<ObservationOutcome>> =>
    Effect.gen(function* () {
      const activeRows = yield* database.query<OccurrenceRow>(SELECT_ACTIVE_OCCURRENCES_BY_SOURCE, [
        source,
      ]);
      const absent = absentOccurrences(activeRows.map(occurrenceFromRow), seenExternalIds);
      if (absent.length === 0) {
        return [];
      }

      const now = DateTime.formatIso(yield* DateTime.now);
      const sequenceRows = yield* database.query<NextSequenceRow>(SELECT_NEXT_SEQUENCE, []);
      let nextSequence = sequenceRows[0]?.nextSequence ?? 1;

      const writes: Array<Write> = absent.map((occurrence) => ({
        sql: DEACTIVATE_OCCURRENCE,
        bindings: [occurrence.id],
      }));
      const outcomes: Array<ObservationOutcome> = [];

      // Grouped, because this source may carry two adverts for one vacancy:
      // closing it twice would burn two sequence numbers and report the same
      // closure to a saved search twice.
      const goingByJob = new Map<string, number>();
      for (const occurrence of absent) {
        goingByJob.set(
          occurrence.canonicalJobId,
          (goingByJob.get(occurrence.canonicalJobId) ?? 0) + 1,
        );
      }

      for (const [jobId, going] of goingByJob) {
        const counted = yield* database.query<CountRow>(COUNT_ACTIVE_OCCURRENCES, [jobId]);
        // The count still includes the occurrences this sweep is about to
        // deactivate, so a vacancy closes exactly when it has nothing else.
        if ((counted[0]?.activeCount ?? 0) > going) {
          continue;
        }
        const jobRows = yield* database.query<CanonicalJobRow>(SELECT_CANONICAL_JOB_BY_ID, [jobId]);
        if (jobRows[0] === undefined) {
          continue;
        }
        const job = canonicalJobFromRow(jobRows[0]);
        if (job.status._tag === "Closed") {
          continue;
        }
        const closed = closeCanonical(job, nextSequence, now);
        nextSequence += 1;
        writes.push({
          sql: UPDATE_CANONICAL_JOB,
          bindings: updateCanonicalJobBindings(
            rowFromCanonicalJob(closed, jobRows[0].canonicalKey),
          ),
        });
        outcomes.push({ _tag: "ClosedCanonical", id: closed.id });
      }

      yield* database.atomic(writes);
      return outcomes;
    });
