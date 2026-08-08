import * as Effect from "effect/Effect";
import * as DateTime from "effect/DateTime";
import type { CanonicalJob, DetailFields } from "@job-index/domain/Job";
import type { CanonicalJobId } from "@job-index/domain/Ids";
import type { HydrationTarget } from "../services/Corpus.ts";
import type { DatabaseShape } from "./databaseShape.ts";
import { closeCanonical } from "./decide.ts";
import {
  canonicalJobFromRow,
  occurrenceFromRow,
  rowFromCanonicalJob,
  updateCanonicalJobBindings,
} from "./rows.ts";
import type { CanonicalJobRow, OccurrenceRow } from "./rows.ts";
import {
  SELECT_ACTIVE_OCCURRENCE_BY_CANONICAL_JOB,
  SELECT_CANONICAL_JOB_BY_ID,
  SELECT_NEXT_SEQUENCE,
  UPDATE_CANONICAL_JOB,
} from "./sql.ts";

interface NextSequenceRow {
  readonly nextSequence: number;
}

/** Corpus.occurrenceFor: see the interface doc comment on why this lives here. */
export const makeOccurrenceFor =
  (database: DatabaseShape) =>
  (id: CanonicalJobId): Effect.Effect<HydrationTarget | undefined> =>
    Effect.map(
      database.query<OccurrenceRow>(SELECT_ACTIVE_OCCURRENCE_BY_CANONICAL_JOB, [id]),
      (rows) => {
        if (rows[0] === undefined) return undefined;
        const occurrence = occurrenceFromRow(rows[0]);
        return { platformId: occurrence.platformId, externalId: occurrence.externalId };
      },
    );

/**
 * Corpus.hydrateDetail: patches a completed detail fetch onto the canonical
 * row. Does not touch `sequence`/`changedAt` — a saved search asks what
 * changed about a vacancy's title, employer, location, or status, none of
 * which hydration ever changes (see `design-specs/deferred-hydration.md`'s
 * falsifier 3), so hydrating a job must never look like a change to that
 * stream.
 */
export const makeHydrateDetail =
  (database: DatabaseShape) =>
  (id: CanonicalJobId, detail: DetailFields): Effect.Effect<CanonicalJob | undefined> =>
    Effect.gen(function* () {
      const rows = yield* database.query<CanonicalJobRow>(SELECT_CANONICAL_JOB_BY_ID, [id]);
      const row = rows[0];
      if (row === undefined) return undefined;
      const job = canonicalJobFromRow(row);
      if (job.hydration._tag === "Hydrated") return job;

      const hydrated: CanonicalJob = {
        ...job,
        applicationUrl: detail.applicationUrl,
        hydration: {
          _tag: "Hydrated",
          description: detail.description,
          deadline: detail.deadline,
        },
      };
      yield* database.atomic([
        {
          sql: UPDATE_CANONICAL_JOB,
          bindings: updateCanonicalJobBindings(rowFromCanonicalJob(hydrated, row.canonicalKey)),
        },
      ]);
      return hydrated;
    });

/** Corpus.closeEarly: see the interface doc comment on why this differs from `closeAbsent`. */
export const makeCloseEarly =
  (database: DatabaseShape) =>
  (id: CanonicalJobId): Effect.Effect<CanonicalJob | undefined> =>
    Effect.gen(function* () {
      const rows = yield* database.query<CanonicalJobRow>(SELECT_CANONICAL_JOB_BY_ID, [id]);
      const row = rows[0];
      if (row === undefined) return undefined;
      const job = canonicalJobFromRow(row);
      if (job.status._tag === "Closed") return job;

      const sequenceRows = yield* database.query<NextSequenceRow>(SELECT_NEXT_SEQUENCE, []);
      const now = DateTime.formatIso(yield* DateTime.now);
      const closed = closeCanonical(job, sequenceRows[0]?.nextSequence ?? 1, now);
      yield* database.atomic([
        {
          sql: UPDATE_CANONICAL_JOB,
          bindings: updateCanonicalJobBindings(rowFromCanonicalJob(closed, row.canonicalKey)),
        },
      ]);
      return closed;
    });
