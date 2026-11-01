import * as Schema from "effect/Schema";
import { FactState } from "./Ir.ts";

/**
 * The D1 row shapes of the observation store (migration `0006_observation-store.sql`). `scripts/ts/schema.ts`
 * derives the column names from these structs; types, keys and the append-only triggers are declared there.
 *
 * - `observations`: append-only and content-addressed (`id` is `Ir.observationId` of `payload`). SQLite triggers
 *   reject `UPDATE` and `DELETE`, except a `DELETE` of a row that already has a tombstone (the one purge path).
 * - `observation_tombstones`: the record a lawful purge leaves. Permanent; it also blocks re-insertion of the purged
 *   content, so a replay cannot undo an erasure.
 * - `workload_projection`: rebuildable from `observations` at any time (`Projection.rebuild`).
 */
export const ObservationRow = Schema.Struct({
  id: Schema.String,
  irVersion: Schema.Int,
  sourceId: Schema.String,
  externalId: Schema.String,
  kind: Schema.String,
  status: Schema.String,
  dateModified: Schema.NullOr(Schema.String),
  recordedSeq: Schema.Int,
  recordedAt: Schema.String,
  runId: Schema.String,
  /** The encoded IR content, as JSON text. */
  payload: Schema.String,
});
export type ObservationRow = typeof ObservationRow.Type;

export const ObservationTombstoneRow = Schema.Struct({
  observationId: Schema.String,
  sourceId: Schema.String,
  externalId: Schema.String,
  reason: Schema.String,
  purgedAt: Schema.String,
});
export type ObservationTombstoneRow = typeof ObservationTombstoneRow.Type;

export const WorkloadProjectionRow = Schema.Struct({
  canonicalJobId: Schema.String,
  workloadState: FactState,
  workloadMin: Schema.NullOr(Schema.Number),
  workloadMax: Schema.NullOr(Schema.Number),
  workloadMethod: Schema.String,
});
export type WorkloadProjectionRow = typeof WorkloadProjectionRow.Type;
