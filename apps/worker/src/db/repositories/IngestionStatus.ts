import * as Effect from "effect/Effect";
import type { PlatformId } from "@job-index/domain/Ids";
import { Database } from "../../services/Database.ts";

const RUNS = "ingestion_runs";
const FAILURES = "ingestion_failures";

export interface IngestionStatusState {
  readonly checkpointAt: string | undefined;
  readonly consecutiveFailures: number;
}

/**
 * Reads the latest successful NAV run and the failures recorded after it.
 *
 * `source_state.updatedAt` is not a success boundary: collection checkpoints
 * it from an `ensuring` finalizer even when a page fails. Successful run
 * records are authoritative only when at least one page completed and the
 * run did not fail. When the source has never completed successfully, every
 * recorded failure is consecutive.
 */
export const find = (
  platformId: PlatformId,
): Effect.Effect<IngestionStatusState, never, Database> =>
  Effect.gen(function* () {
    const db = yield* Database;
    const checkpoints = yield* db.query<{ startedAt: string }>(
      `SELECT startedAt FROM ${RUNS} WHERE platformId = ? AND pages > 0 AND stoppedReason NOT LIKE 'failed:%' ORDER BY startedAt DESC LIMIT 1`,
      [platformId],
    );
    const checkpointAt = checkpoints[0]?.startedAt;
    const failures = yield* db.query<{ count: number }>(
      checkpointAt === undefined
        ? `SELECT COUNT(*) AS count FROM ${FAILURES} WHERE platformId = ?`
        : `SELECT COUNT(*) AS count FROM ${FAILURES} WHERE platformId = ? AND occurredAt > ?`,
      checkpointAt === undefined ? [platformId] : [platformId, checkpointAt],
    );
    return {
      checkpointAt,
      consecutiveFailures: failures[0]?.count ?? 0,
    };
  });
