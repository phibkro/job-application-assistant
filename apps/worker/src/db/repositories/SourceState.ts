import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { SourceState } from "@job-index/domain/Ingestion";
import type { PlatformId, SourceId } from "@job-index/domain/Ids";
import { Database } from "../../services/Database.ts";
import { decodeRows } from "../Sql.ts";

const TABLE = "source_state";

export const find = (
  platformId: PlatformId,
): Effect.Effect<SourceState | undefined, never, Database> =>
  Effect.gen(function* () {
    const db = yield* Database;
    const rows = yield* db.query<unknown>(`SELECT * FROM ${TABLE} WHERE platformId = ?`, [
      platformId,
    ]);
    const decoded = yield* decodeRows<SourceState>(SourceState as never)(rows);
    return decoded[0];
  });

export interface LeaseAttempt {
  readonly platformId: PlatformId;
  readonly owner: string;
  readonly leaseTtlMs: number;
  /** Where a brand-new platform's sweep begins; ignored if a row already exists. */
  readonly startCursor: string;
  readonly now: DateTime.Utc;
}

/**
 * Attempts to acquire the lease, racing safely against another run.
 *
 * One statement, not a read-then-write: two `collect` calls that both see
 * "no live lease" and both try to acquire at once must not both succeed.
 * SQLite serializes writes, so of two concurrent `INSERT ... ON CONFLICT DO
 * UPDATE ... WHERE` statements racing on the same row, only the first to
 * commit satisfies its own `WHERE` (the lease was free); the second's
 * `WHERE` now sees the row the first one just wrote — a lease that has not
 * yet expired — and matches nothing, so its `DO UPDATE` is a no-op. Reading
 * the row back afterward is what tells the two callers apart: whoever's
 * `leaseOwner` is on the row is the one that actually holds it, not merely
 * the one that tried first.
 *
 * On a brand-new platform (no row yet) the plain `INSERT` fires, seeding
 * `cursor` at `startCursor` and `seenExternalIds` at `[]` — the beginning of
 * this platform's very first sweep. On a returning platform the `DO UPDATE`
 * branch never assigns `cursor`/`seenExternalIds`: whichever sweep was in
 * progress keeps its place, lease or no lease.
 */
export const acquireLease = (attempt: LeaseAttempt): Effect.Effect<SourceState, never, Database> =>
  Effect.gen(function* () {
    const db = yield* Database;
    const nowMs = DateTime.toEpochMillis(attempt.now);
    const nowIso = DateTime.formatIso(attempt.now);
    const leaseExpiresAt = nowMs + attempt.leaseTtlMs;
    yield* db.run(
      `INSERT INTO ${TABLE} (platformId, cursor, seenExternalIds, resolvedSourceId, leaseOwner, leaseExpiresAt, updatedAt)
       VALUES (?, ?, '[]', NULL, ?, ?, ?)
       ON CONFLICT (platformId) DO UPDATE SET
         leaseOwner = excluded.leaseOwner,
         leaseExpiresAt = excluded.leaseExpiresAt,
         updatedAt = excluded.updatedAt
       WHERE ${TABLE}.leaseExpiresAt IS NULL OR ${TABLE}.leaseExpiresAt <= ?`,
      [attempt.platformId, attempt.startCursor, attempt.owner, leaseExpiresAt, nowIso, nowMs],
    );
    const row = yield* find(attempt.platformId);
    if (row === undefined) {
      // This statement just wrote the row unconditionally on one branch or
      // the other; its absence here is a defect in this function, not a
      // business outcome any caller could recover from.
      return yield* Effect.die(
        "source_state row missing immediately after acquireLease's own upsert",
      );
    }
    return row;
  });

/**
 * Persists progress without releasing the lease: a page fully folded, so a
 * crash after this point re-reads the *next* page, never the one just
 * checkpointed. `resolvedSourceId` is written with `COALESCE` semantics —
 * passing `undefined` leaves whatever the row already has, since it is
 * learned once and never un-learned.
 */
export const checkpoint = (
  platformId: PlatformId,
  owner: string,
  cursor: string,
  seenExternalIds: ReadonlyArray<string>,
  resolvedSourceId: SourceId | undefined,
  now: DateTime.Utc,
): Effect.Effect<void, never, Database> =>
  Effect.gen(function* () {
    const db = yield* Database;
    yield* db.run(
      `UPDATE ${TABLE}
       SET cursor = ?, seenExternalIds = ?, resolvedSourceId = COALESCE(?, resolvedSourceId), updatedAt = ?
       WHERE platformId = ? AND leaseOwner = ?`,
      [
        cursor,
        JSON.stringify(seenExternalIds),
        resolvedSourceId ?? null,
        DateTime.formatIso(now),
        platformId,
        owner,
      ],
    );
  });

/**
 * Ends the run: releases the lease and persists wherever the sweep landed —
 * still in progress (budget exhausted, or a page failed) or reset to the
 * start (a sweep that just closed). Guarded by `leaseOwner = ?` the same way
 * `checkpoint` is: a lease this run no longer holds must not have its
 * successor's progress overwritten by a straggler.
 */
export const finish = (
  platformId: PlatformId,
  owner: string,
  cursor: string,
  seenExternalIds: ReadonlyArray<string>,
  resolvedSourceId: SourceId | undefined,
  now: DateTime.Utc,
): Effect.Effect<void, never, Database> =>
  Effect.gen(function* () {
    const db = yield* Database;
    yield* db.run(
      `UPDATE ${TABLE}
       SET cursor = ?, seenExternalIds = ?, resolvedSourceId = COALESCE(?, resolvedSourceId),
           leaseOwner = NULL, leaseExpiresAt = NULL, updatedAt = ?
       WHERE platformId = ? AND leaseOwner = ?`,
      [
        cursor,
        JSON.stringify(seenExternalIds),
        resolvedSourceId ?? null,
        DateTime.formatIso(now),
        platformId,
        owner,
      ],
    );
  });

/** Reads the owner off a row's `Option`, for the one call site that needs a plain value. */
export const ownerOf = (state: SourceState): string | undefined =>
  Option.getOrUndefined(state.leaseOwner);
