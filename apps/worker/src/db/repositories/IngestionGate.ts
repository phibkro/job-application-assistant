import * as Effect from "effect/Effect";
import { Database } from "../../services/Database.ts";
import type { PlatformId } from "@job-index/domain/Ids";

const TABLE = "ingestion_gate";

/**
 * The epoch stamp a first-ever claim seeds the row with, so "never
 * attempted" is expressed in the same currency as every later stamp — one
 * lexicographic comparison against `lastAttemptAt <= cutoff` — instead of an
 * absent-row branch racing a concurrent insert.
 */
export const EPOCH = "1970-01-01T00:00:00.000Z";

export interface GateStamp {
  readonly lastAttemptAt: string;
}

/**
 * One compare-and-set over the platform's gate row (WS-0017's single-flight):
 * seed the row when absent, then conditionally advance its stamp to `nowIso`
 * — but only if the current stamp is at or before `floorCutoffIso`.
 *
 * The batch is D1's atomic primitive (`Database.atomicAffected`, whose doc
 * comment names this exact use), so of any number of isolates racing the
 * same window exactly one sees `changes() = 1` and wins; every loser reads
 * the winner's fresh stamp. A won claim is the *whole* permission to run:
 * the caller that lost must not collect.
 *
 * Returns true only for the caller that won the window.
 */
export const claim = (
  platformId: PlatformId,
  nowIso: string,
  floorCutoffIso: string,
): Effect.Effect<boolean, never, Database> =>
  Effect.gen(function* () {
    const db = yield* Database;
    const affected = yield* db.atomicAffected([
      {
        sql: `INSERT OR IGNORE INTO ${TABLE} (platformId, lastAttemptAt) VALUES (?, ?)`,
        bindings: [platformId, EPOCH],
      },
      {
        sql: `UPDATE ${TABLE} SET lastAttemptAt = ? WHERE platformId = ? AND lastAttemptAt <= ?`,
        bindings: [nowIso, platformId, floorCutoffIso],
      },
    ]);
    return affected[1] === 1;
  });

/** Reads the platform's last attempt stamp, `undefined` before any attempt. */
export const find = (
  platformId: PlatformId,
): Effect.Effect<GateStamp | undefined, never, Database> =>
  Effect.gen(function* () {
    const db = yield* Database;
    const rows = yield* db.query<{ lastAttemptAt: string }>(
      `SELECT lastAttemptAt FROM ${TABLE} WHERE platformId = ?`,
      [platformId],
    );
    return rows[0] === undefined ? undefined : { lastAttemptAt: rows[0].lastAttemptAt };
  });
