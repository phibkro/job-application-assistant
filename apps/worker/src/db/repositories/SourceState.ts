import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
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

/**
 * Persists a sweep's position: a page fully folded, or — once a walk has
 * reached the tail and `closeAbsent` has run — the reset back to the
 * beginning that starts the next sweep. Upserts, because a never-before-seen
 * platform has no row yet: the first checkpoint of its first sweep *is* that
 * row, not a separate seeding step the way `acquireLease` used to seed one.
 *
 * `resolvedSourceId` is written with `COALESCE` semantics on the update
 * branch — learned once from the first listing this platform ever produced,
 * never un-learned — and directly on the insert branch, where there is
 * nothing yet to preserve.
 *
 * Carries no lease and no owner: whether this call may run at all is decided
 * before it is ever reached, by the platform's `SourceLease` Durable Object
 * (see `ingestion/SourceLeaseObject.ts`), which admits one collector for a
 * given platform at a time. That is a property of *where the check runs*,
 * not one this table has to police with a guard column and a comparison —
 * `Ingestion.collect` never has two callers checkpointing the same platform
 * concurrently to guard against.
 */
export const checkpoint = (
  platformId: PlatformId,
  cursor: string,
  seenExternalIds: ReadonlyArray<string>,
  resolvedSourceId: SourceId | undefined,
  now: DateTime.Utc,
): Effect.Effect<void, never, Database> =>
  Effect.gen(function* () {
    const db = yield* Database;
    yield* db.run(
      `INSERT INTO ${TABLE} (platformId, cursor, seenExternalIds, resolvedSourceId, updatedAt)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (platformId) DO UPDATE SET
         cursor = excluded.cursor,
         seenExternalIds = excluded.seenExternalIds,
         resolvedSourceId = COALESCE(excluded.resolvedSourceId, ${TABLE}.resolvedSourceId),
         updatedAt = excluded.updatedAt`,
      [
        platformId,
        cursor,
        JSON.stringify(seenExternalIds),
        resolvedSourceId ?? null,
        DateTime.formatIso(now),
      ],
    );
  });
