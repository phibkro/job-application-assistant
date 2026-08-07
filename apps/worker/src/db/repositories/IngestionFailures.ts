import * as Effect from "effect/Effect";
import { IngestionFailure } from "@job-index/domain/Ingestion";
import { Database } from "../../services/Database.ts";
import { columnsOf, encodeVariant, insertStatement } from "../Sql.ts";

const TABLE = "ingestion_failures";

/**
 * Append-only. A retried, eventually-successful failure and a run-ending one
 * are both worth keeping: this table answers "is NAV down or is nobody
 * hiring", and a failure that self-resolved a minute later is still evidence
 * of which one it was.
 */
export const record = (failure: IngestionFailure): Effect.Effect<void, never, Database> =>
  Effect.gen(function* () {
    const db = yield* Database;
    const encoded = yield* encodeVariant<IngestionFailure>(IngestionFailure as never)(failure);
    const stmt = insertStatement(TABLE, columnsOf(IngestionFailure as never), encoded);
    yield* db.run(stmt.sql, stmt.bindings);
  });
