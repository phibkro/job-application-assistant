import * as Effect from "effect/Effect";
import * as DateTime from "effect/DateTime";
import type { NormalizedListing, ObservationOutcome } from "@job-index/domain/Job";
import type { DatabaseShape } from "./databaseShape.ts";
import { decideObservation } from "./decide.ts";
import {
  canonicalJobFromRow,
  insertCanonicalJobBindings,
  insertOccurrenceBindings,
  occurrenceFromRow,
  rowFromCanonicalJob,
  rowFromOccurrence,
  updateCanonicalJobBindings,
  updateOccurrenceBindings,
  type CanonicalJobRow,
  type OccurrenceRow,
} from "./rows.ts";
import {
  INSERT_CANONICAL_JOB,
  INSERT_OCCURRENCE,
  SELECT_CANONICAL_JOB_BY_ID,
  SELECT_NEXT_SEQUENCE,
  SELECT_OCCURRENCE_BY_ID,
  UPDATE_CANONICAL_JOB,
  UPDATE_OCCURRENCE,
} from "./sql.ts";

interface NextSequenceRow {
  readonly nextSequence: number;
}

/**
 * Corpus.observe: read what the corpus already knows about this
 * canonical/occurrence pair, hand it to the pure `decideObservation`, then
 * write back only what changed. Wrapped in `database.transaction` because a
 * crash between the canonical write and the occurrence write must not leave
 * a canonical job with no occurrence behind it, or vice versa — the same
 * reasoning `Database.transaction`'s own doc comment gives for the outbox.
 */
export const makeObserve =
  (database: DatabaseShape) =>
  (listing: NormalizedListing): Effect.Effect<ObservationOutcome> =>
    database.transaction(
      Effect.gen(function* () {
        const canonicalRows = yield* database.query<CanonicalJobRow>(SELECT_CANONICAL_JOB_BY_ID, [
          listing.canonicalJobId,
        ]);
        const occurrenceRows = yield* database.query<OccurrenceRow>(SELECT_OCCURRENCE_BY_ID, [
          listing.occurrenceId,
        ]);
        const sequenceRows = yield* database.query<NextSequenceRow>(SELECT_NEXT_SEQUENCE, []);
        const now = yield* DateTime.now;

        const decision = decideObservation(listing, {
          existingCanonical:
            canonicalRows[0] === undefined ? undefined : canonicalJobFromRow(canonicalRows[0]),
          existingOccurrence:
            occurrenceRows[0] === undefined ? undefined : occurrenceFromRow(occurrenceRows[0]),
          nextSequence: sequenceRows[0]?.nextSequence ?? 1,
          now: DateTime.formatIso(now),
        });

        if (decision.writeCanonical) {
          const row = rowFromCanonicalJob(decision.canonical, listing.canonicalKey);
          yield* canonicalRows[0] === undefined
            ? database.run(INSERT_CANONICAL_JOB, insertCanonicalJobBindings(row))
            : database.run(UPDATE_CANONICAL_JOB, updateCanonicalJobBindings(row));
        }

        const occurrenceRow = rowFromOccurrence(decision.occurrence);
        yield* decision.writeOccurrence === "insert"
          ? database.run(INSERT_OCCURRENCE, insertOccurrenceBindings(occurrenceRow))
          : database.run(UPDATE_OCCURRENCE, updateOccurrenceBindings(occurrenceRow));

        return decision.outcome;
      }),
    );
