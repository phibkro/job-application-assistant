import * as Effect from "effect/Effect";
import { Ingestion } from "../services/Ingestion.ts";
import { SourceCatalog } from "../services/SourceCatalog.ts";
import { DEFAULT_RUN_BUDGET } from "./lazy.ts";

/**
 * Local preview/testing only. No stage declares a cron trigger any more —
 * production ingestion is lazy, driven by authenticated site usage through
 * `ingestion/lazy.ts` (WS-0017). This module survives solely so
 * `scripts/preview.sh`'s `--test-scheduled` hook (`/_scheduled`) can run one
 * bounded real NAV page locally; it is dead code in every deployment.
 */

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
