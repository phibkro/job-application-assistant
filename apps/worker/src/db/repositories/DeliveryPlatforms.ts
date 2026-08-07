import * as Effect from "effect/Effect";
import { DeliveryPlatform } from "@job-index/domain/Delivery";
import type { DeliveryPlatformId } from "@job-index/domain/Ids";
import { Database } from "../../services/Database.ts";
import {
  columnsOf,
  decodeRow,
  decodeRows,
  encodeVariant,
  insertStatement,
  updateStatement,
} from "../Sql.ts";

const TABLE = "delivery_platforms";
const KEY = ["id"];

export const insert = (platform: DeliveryPlatform): Effect.Effect<void, never, Database> =>
  Effect.gen(function* () {
    const db = yield* Database;
    const encoded = yield* encodeVariant<DeliveryPlatform>(
      (DeliveryPlatform as never as { insert: object }).insert as never,
    )(platform);
    const stmt = insertStatement(
      TABLE,
      columnsOf((DeliveryPlatform as never as { insert: object }).insert as never),
      encoded,
    );
    yield* db.run(stmt.sql, stmt.bindings);
  });

/**
 * The rung an agent's learning climbs: `tier`, `mappings`, and `learnedAt`
 * all change as a platform goes from unknown to scripted (`Delivery.ts`'s
 * docstring), so — unlike `answers`/`freshness`/`subscriptions` — this table
 * genuinely needs `UPDATE`, and it has the real `id PRIMARY KEY` to key one.
 */
export const update = (platform: DeliveryPlatform): Effect.Effect<void, never, Database> =>
  Effect.gen(function* () {
    const db = yield* Database;
    const variant = (DeliveryPlatform as never as { update: object }).update as never;
    const encoded = yield* encodeVariant<DeliveryPlatform>(variant)(platform);
    const stmt = updateStatement(TABLE, columnsOf(variant), KEY, encoded);
    yield* db.run(stmt.sql, stmt.bindings);
  });

export const findById = (
  id: DeliveryPlatformId,
): Effect.Effect<DeliveryPlatform | undefined, never, Database> =>
  Effect.gen(function* () {
    const db = yield* Database;
    const rows = yield* db.query<unknown>(`SELECT * FROM ${TABLE} WHERE id = ?`, [id]);
    return rows[0] === undefined
      ? undefined
      : yield* decodeRow<DeliveryPlatform>(DeliveryPlatform as never)(rows[0]);
  });

export const all = (): Effect.Effect<ReadonlyArray<DeliveryPlatform>, never, Database> =>
  Effect.gen(function* () {
    const db = yield* Database;
    const rows = yield* db.query<unknown>(`SELECT * FROM ${TABLE}`, []);
    return yield* decodeRows<DeliveryPlatform>(DeliveryPlatform as never)(rows);
  });
