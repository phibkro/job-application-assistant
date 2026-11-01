import * as Schema from "effect/Schema";
import { FactState } from "./Ir.ts";

/**
 * The D1 row shapes of the observation store (migration `0006_observation-store.sql`). `scripts/ts/schema.ts`
 * derives the column names from these structs; types, keys and the append-only triggers are declared there.
 *
 * - `observations`: append-only and content-addressed (`id` is `Ir.observationId` of `payload`). SQLite triggers
 *   reject `UPDATE` and `DELETE`, except a `DELETE` of a row that already has a matching tombstone (the one purge
 *   path); `INSERT` guards make a same-content replay a no-op, reject an overwrite (including `INSERT OR REPLACE`),
 *   and reject a `recordedSeq` not above every sequence ever issued.
 * - `observation_tombstones`: the record a lawful purge leaves. Permanent; it also blocks re-insertion of the purged
 *   content, so a replay cannot undo an erasure, and keeps the purged `recordedSeq`, so the sequence never goes back.
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
  /** The purged row's recorded sequence: kept so a later append can never reuse it (WS-0022 review R1). */
  recordedSeq: Schema.Int,
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
