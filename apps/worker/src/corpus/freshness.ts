import * as Effect from "effect/Effect";
import * as DateTime from "effect/DateTime";
import type { CanonicalJob } from "@job-index/domain/Job";
import type { ProfileId, Sequence } from "@job-index/domain/Ids";
import type { DatabaseShape } from "./databaseShape.ts";
import { canonicalJobFromRow, type CanonicalJobRow } from "./rows.ts";
import {
  INSERT_FRESHNESS,
  SELECT_FRESH_CANONICAL_JOBS,
  SELECT_FRESHNESS_BY_PROFILE,
  UPDATE_FRESHNESS,
} from "./sql.ts";

interface FreshnessRow {
  readonly profileId: string;
  readonly seenThrough: number;
  readonly updatedAt: string;
}

/**
 * Corpus.fresh: vacancies this *profile* — not this saved search, not this
 * chat — has not been offered. A profile with no `freshness` row yet has
 * seen nothing (`seenThrough` defaults to 0), so everything is fresh. Closed
 * vacancies are excluded: offering something no longer open is not "fresh",
 * it's a dead end.
 */
export const makeFresh =
  (database: DatabaseShape) =>
  (profile: ProfileId, limit: number): Effect.Effect<ReadonlyArray<CanonicalJob>> =>
    Effect.gen(function* () {
      const freshnessRows = yield* database.query<FreshnessRow>(SELECT_FRESHNESS_BY_PROFILE, [
        profile,
      ]);
      const seenThrough = freshnessRows[0]?.seenThrough ?? 0;
      const jobRows = yield* database.query<CanonicalJobRow>(SELECT_FRESH_CANONICAL_JOBS, [
        seenThrough,
        limit,
      ]);
      return jobRows.map(canonicalJobFromRow);
    });

/**
 * Corpus.markOffered: advances the high-water mark, never rewinds it. Two
 * surfaces (a saved search and the plain feed) may both call this for the
 * same profile in either order; monotonicity means whichever arrives second
 * cannot undo the first one's progress, which is exactly what "per profile,
 * not per surface" requires in practice, not just in the freshness read.
 */
export const makeMarkOffered =
  (database: DatabaseShape) =>
  (profile: ProfileId, through: Sequence): Effect.Effect<void> =>
    Effect.gen(function* () {
      const freshnessRows = yield* database.query<FreshnessRow>(SELECT_FRESHNESS_BY_PROFILE, [
        profile,
      ]);
      const now = DateTime.formatIso(yield* DateTime.now);

      // One statement either way, so there is nothing for a batch to hold
      // together: a single write is already all-or-nothing.
      if (freshnessRows[0] === undefined) {
        yield* database.run(INSERT_FRESHNESS, [profile, through, now]);
      } else if (through > freshnessRows[0].seenThrough) {
        yield* database.run(UPDATE_FRESHNESS, [through, now, profile]);
      }
    });
