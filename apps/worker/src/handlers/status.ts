import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as HttpApiBuilder from "effect/unstable/httpapi/HttpApiBuilder";
import { NAV_PLATFORM_ID } from "@job-index/adapters/nav";
import { api } from "../Api.ts";
import * as IngestionStatus from "../db/repositories/IngestionStatus.ts";
import * as IngestionGate from "../db/repositories/IngestionGate.ts";
import { Database } from "../services/Database.ts";

/**
 * Public, read-only observability for the bounded NAV ingestion loop.
 *
 * Successful `ingestion_runs.startedAt` values provide the checkpoint
 * boundary. Failure records strictly after that timestamp remain consecutive;
 * a later successful run resets the sequence without a mutable counter.
 */
export const layer = HttpApiBuilder.group(api, "ingestion", (handlers) =>
  handlers.handle("navStatus", () =>
    Effect.gen(function* () {
      const database = yield* Database;
      const state = yield* Effect.provideService(
        IngestionStatus.find(NAV_PLATFORM_ID),
        Database,
        database,
      );
      const gate = yield* Effect.provideService(
        IngestionGate.find(NAV_PLATFORM_ID),
        Database,
        database,
      );
      const now = yield* DateTime.now;
      const checkpointAt = state.checkpointAt;
      const lagSeconds =
        checkpointAt === undefined
          ? null
          : Math.max(
              0,
              (DateTime.toEpochMillis(now) -
                DateTime.toEpochMillis(DateTime.makeUnsafe(checkpointAt))) /
                1000,
            );
      return {
        data: {
          lag_seconds: lagSeconds,
          consecutive_failures: state.consecutiveFailures,
          // The lazy gate's own liveness (WS-0017): when the last attempt
          // fired. `null` with recent authenticated traffic is the
          // "gate never armed" signature.
          lastAttemptAt: gate?.lastAttemptAt ?? null,
        },
      };
    }),
  ),
);
