import * as Effect from "effect/Effect";
import { Ingestion } from "../services/Ingestion.ts";
import type { RunBudget } from "../services/Ingestion.ts";
import { SourceCatalog } from "../services/SourceCatalog.ts";

/**
 * One checkpointable source page per invocation. D1 folding is intentionally
 * sequential, so starting another page would risk losing the first page's
 * durable cursor if the platform terminates the event before the run report.
 */
const DEFAULT_RUN_BUDGET: RunBudget = {
  maxPages: 1,
  maxObservations: 2000,
  maxDurationMs: 25_000,
  leaseRecoveryMs: 5 * 60 * 1000,
};

/** Runs one bounded collection attempt for every feed source this deployment implements. */
export const scheduledIngestion: Effect.Effect<void, never, Ingestion | SourceCatalog> = Effect.gen(
  function* () {
    const catalog = yield* SourceCatalog;
    const ingestion = yield* Ingestion;
    const entries = yield* catalog.list({ _tag: "Feed" });
    yield* Effect.forEach(
      entries,
      (entry) =>
        ingestion
          .collect(entry.id, DEFAULT_RUN_BUDGET)
          .pipe(Effect.catchTag("LeaseHeld", () => Effect.void)),
      { discard: true },
    );
  },
);
