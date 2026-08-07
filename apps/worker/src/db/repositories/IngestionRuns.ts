import * as Effect from "effect/Effect";
import { IngestionRun } from "@job-index/domain/Ingestion";
import { Database } from "../../services/Database.ts";
import { columnsOf, encodeVariant, insertStatement } from "../Sql.ts";

const TABLE = "ingestion_runs";

/**
 * Append-only, like `Judgements`: a `collect` invocation is history the
 * moment it returns, never a row to overwrite. What makes a quiet week
 * distinguishable from a broken connector — see `Ingestion.ts`'s own doc
 * comment on `RunReport.stoppedReason`.
 */
export const record = (run: IngestionRun): Effect.Effect<void, never, Database> =>
  Effect.gen(function* () {
    const db = yield* Database;
    const encoded = yield* encodeVariant<IngestionRun>(IngestionRun as never)(run);
    const stmt = insertStatement(TABLE, columnsOf(IngestionRun as never), encoded);
    yield* db.run(stmt.sql, stmt.bindings);
  });
