import * as Effect from "effect/Effect";
import type { Write } from "../services/Database.ts";
import type { DatabaseShape } from "./databaseShape.ts";
import type { CanonicalJobRow, OccurrenceRow } from "./rows.ts";
import {
  CANONICAL_JOB_FIELDS,
  COUNT_ACTIVE_OCCURRENCES,
  DEACTIVATE_OCCURRENCE,
  INSERT_CANONICAL_JOB,
  INSERT_FRESHNESS,
  INSERT_OCCURRENCE,
  SELECT_CANONICAL_JOB_BY_ID,
  SELECT_CANONICAL_JOBS_CHANGED_SINCE,
  SELECT_FRESH_CANONICAL_JOBS,
  SELECT_FRESHNESS_BY_PROFILE,
  OCCURRENCE_FIELDS,
  SELECT_ACTIVE_OCCURRENCES_BY_SOURCE,
  SELECT_NEXT_SEQUENCE,
  SELECT_OCCURRENCE_BY_ID,
  UPDATE_CANONICAL_JOB,
  UPDATE_FRESHNESS,
  UPDATE_OCCURRENCE,
} from "./sql.ts";

interface FreshnessRow {
  readonly profileId: string;
  readonly seenThrough: number;
  readonly updatedAt: string;
}

const CANONICAL_JOB_FIELDS_AFTER_ID = CANONICAL_JOB_FIELDS.filter((field) => field !== "id");

const OCCURRENCE_FIELDS_AFTER_ID = OCCURRENCE_FIELDS.filter((field) => field !== "id");

/**
 * `INSERT_*` puts `id` first; `UPDATE_*` puts it last (`WHERE id = ?`) — see
 * `sql.ts` and `rows.ts`'s binding-order helpers. Both shapes carry the same
 * fields in between, so this reconstructs a row from either without
 * duplicating the field list per statement.
 */
const rowFromBindings = <Row extends { readonly id: string }>(
  fields: ReadonlyArray<string>,
  idFirst: boolean,
  bindings: ReadonlyArray<unknown>,
): Row => {
  const id = idFirst ? bindings[0] : bindings[bindings.length - 1];
  const rest = idFirst ? bindings.slice(1) : bindings.slice(0, -1);
  const record = Object.fromEntries(fields.map((field, index) => [field, rest[index]]));
  return { id, ...record } as Row;
};

/**
 * An in-memory `Database` double for this slot's own tests.
 *
 * Not a general SQL engine — a small dispatcher over the *exact* fixed
 * statement set `sql.ts` exports, matched by identity (`===`) against those
 * same constants rather than by re-parsing SQL text. Production code and
 * this fake cannot silently drift apart on what a statement means, because
 * there is only one copy of each statement string, imported by both sides.
 *
 * Deliberately not a real SQL engine: `bun:sqlite` has no type declarations
 * in this workspace (no `bun-types` dependency — adding one is a
 * `package.json` edit outside this slot), and `node:sqlite` is unimplemented
 * on the pinned Bun (1.3.13, verified empirically before choosing this
 * design). See `schema.ts` for the fuller account, and for the intended
 * table shape this fake stands in for.
 */
export const makeTestDatabase = (): DatabaseShape => {
  const canonicalJobs = new Map<string, CanonicalJobRow>();
  const occurrences = new Map<string, OccurrenceRow>();
  const freshness = new Map<string, FreshnessRow>();

  const query = <A>(
    sql: string,
    bindings: ReadonlyArray<unknown>,
  ): Effect.Effect<ReadonlyArray<A>> =>
    Effect.sync((): ReadonlyArray<A> => {
      switch (sql) {
        case SELECT_CANONICAL_JOB_BY_ID: {
          const row = canonicalJobs.get(bindings[0] as string);
          return (row === undefined ? [] : [row]) as unknown as ReadonlyArray<A>;
        }
        case SELECT_NEXT_SEQUENCE: {
          const highest = Array.from(canonicalJobs.values(), (row) => row.sequence).reduce(
            (max, sequence) => Math.max(max, sequence),
            0,
          );
          return [{ nextSequence: highest + 1 }] as unknown as ReadonlyArray<A>;
        }
        case SELECT_OCCURRENCE_BY_ID: {
          const row = occurrences.get(bindings[0] as string);
          return (row === undefined ? [] : [row]) as unknown as ReadonlyArray<A>;
        }
        case SELECT_CANONICAL_JOBS_CHANGED_SINCE: {
          const [sequence, limit] = bindings as [number, number];
          return Array.from(canonicalJobs.values())
            .filter((row) => row.sequence > sequence)
            .toSorted((a, b) => a.sequence - b.sequence)
            .slice(0, limit) as unknown as ReadonlyArray<A>;
        }
        case SELECT_FRESH_CANONICAL_JOBS: {
          const [sequence, limit] = bindings as [number, number];
          return Array.from(canonicalJobs.values())
            .filter((row) => row.sequence > sequence && row.statusTag === "Active")
            .toSorted((a, b) => b.sequence - a.sequence)
            .slice(0, limit) as unknown as ReadonlyArray<A>;
        }
        case SELECT_ACTIVE_OCCURRENCES_BY_SOURCE: {
          return Array.from(occurrences.values()).filter(
            (row) => row.sourceId === bindings[0] && row.active === 1,
          ) as unknown as ReadonlyArray<A>;
        }
        case COUNT_ACTIVE_OCCURRENCES: {
          const activeCount = Array.from(occurrences.values()).filter(
            (row) => row.canonicalJobId === bindings[0] && row.active === 1,
          ).length;
          return [{ activeCount }] as unknown as ReadonlyArray<A>;
        }
        case SELECT_FRESHNESS_BY_PROFILE: {
          const row = freshness.get(bindings[0] as string);
          return (row === undefined ? [] : [row]) as unknown as ReadonlyArray<A>;
        }
        default:
          throw new Error(`corpus test Database fake: unrecognised query:\n${sql}`);
      }
    });

  const run = (sql: string, bindings: ReadonlyArray<unknown>): Effect.Effect<void> =>
    Effect.sync(() => {
      switch (sql) {
        case INSERT_CANONICAL_JOB: {
          const row = rowFromBindings<CanonicalJobRow>(
            CANONICAL_JOB_FIELDS_AFTER_ID,
            true,
            bindings,
          );
          canonicalJobs.set(row.id, row);
          return;
        }
        case UPDATE_CANONICAL_JOB: {
          const row = rowFromBindings<CanonicalJobRow>(
            CANONICAL_JOB_FIELDS_AFTER_ID,
            false,
            bindings,
          );
          canonicalJobs.set(row.id, row);
          return;
        }
        case INSERT_OCCURRENCE: {
          const row = rowFromBindings<OccurrenceRow>(OCCURRENCE_FIELDS_AFTER_ID, true, bindings);
          occurrences.set(row.id, row);
          return;
        }
        case UPDATE_OCCURRENCE: {
          const row = rowFromBindings<OccurrenceRow>(OCCURRENCE_FIELDS_AFTER_ID, false, bindings);
          occurrences.set(row.id, row);
          return;
        }
        case DEACTIVATE_OCCURRENCE: {
          const existing = occurrences.get(bindings[0] as string);
          if (existing !== undefined) {
            occurrences.set(existing.id, { ...existing, active: 0 });
          }
          return;
        }
        case INSERT_FRESHNESS: {
          const [profileId, seenThrough, updatedAt] = bindings as [string, number, string];
          freshness.set(profileId, { profileId, seenThrough, updatedAt });
          return;
        }
        case UPDATE_FRESHNESS: {
          const [seenThrough, updatedAt, profileId] = bindings as [number, string, string];
          freshness.set(profileId, { profileId, seenThrough, updatedAt });
          return;
        }
        default:
          throw new Error(`corpus test Database fake: unrecognised statement:\n${sql}`);
      }
    });

  // Applied in order, with no rollback to fake: this store is a plain
  // in-memory map mutated synchronously, so no reader can observe a partial
  // batch. Real batch semantics belong to the layers in `db/`, and
  // `live.test.ts` exercises this slot against one of them.
  const atomic = (writes: ReadonlyArray<Write>): Effect.Effect<void> =>
    Effect.sync(() => {
      for (const write of writes) {
        Effect.runSync(run(write.sql, write.bindings));
      }
    });

  return { query, run, atomic };
};
