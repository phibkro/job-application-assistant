import { NAV_PLATFORM_ID } from "@job-index/adapters/nav";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import type { Database } from "../services/Database.ts";
import type { RunBudget, RunReport } from "../services/Ingestion.ts";
import { Ingestion } from "../services/Ingestion.ts";
import { SourceCatalog } from "../services/SourceCatalog.ts";
import * as IngestionGateRepo from "../db/repositories/IngestionGate.ts";
import { PROVISIONAL_HYDRATION_PER_RUN } from "./hydrationBudget.ts";

/**
 * One checkpointable source page per invocation. D1 folding is intentionally
 * sequential, so starting another page would risk losing the first page's
 * durable cursor if the platform terminates the event before the run report.
 *
 * Shared verbatim by both ingestion drivers — the cron-era `scheduled.ts`
 * (kept for local preview only) and the lazy gate below — so the two can
 * never drift apart on how much one attempt may do.
 *
 * `maxDetailFetches` (WS-0022, option A) is the provisional bounded-hydration
 * default; `INGESTION_HYDRATION_PER_RUN` overrides it for the lazy driver.
 */
export const DEFAULT_RUN_BUDGET: RunBudget = {
  maxPages: 1,
  maxObservations: 2000,
  maxDurationMs: 25_000,
  leaseRecoveryMs: 5 * 60 * 1000,
  maxDetailFetches: PROVISIONAL_HYDRATION_PER_RUN,
};

export type LazyOutcome =
  | { readonly _tag: "WithinFloor" }
  | { readonly _tag: "LeaseHeld" }
  | { readonly _tag: "Claimed"; readonly reports: ReadonlyArray<RunReport> }
  | { readonly _tag: "CollectFailed"; readonly error: unknown };

/**
 * The pure half of the gate: is `lastAttemptAt` older than the floor's
 * cutoff? String comparison only — the stamps are UTC ISO strings, which
 * compare correctly lexicographically (the same property the status route's
 * `ORDER BY startedAt` already relies on). A stamp that fails to parse is a
 * corrupted marker, so it reads as due and lets the normal claim path fix
 * it; it never throws into the caller.
 */
export const attemptDue = (lastAttemptIso: string | undefined, cutoffIso: string): boolean => {
  if (lastAttemptIso === undefined) return true;
  try {
    return (
      DateTime.toEpochMillis(DateTime.makeUnsafe(lastAttemptIso)) <=
      DateTime.toEpochMillis(DateTime.makeUnsafe(cutoffIso))
    );
  } catch {
    return true;
  }
};

/**
 * The default attempt floor: at most one lazy ingestion *attempt* per six
 * hours. The success target — corpus staleness of roughly a day — follows
 * from this plus owner usage; there is deliberately no second knob for it.
 * Overridable per deployment through `INGESTION_ATTEMPT_FLOOR_MS`
 * (`runtime/Env.ts`).
 */
export const DEFAULT_ATTEMPT_FLOOR_MS = 21_600_000;

/**
 * The lazy-ingestion gate (WS-0017). Fires after a caller's response has
 * been computed, inside `ctx.waitUntil`: check the persisted freshness
 * marker, and when the attempt floor has expired claim it with one D1
 * compare-and-set (`IngestionGate.claim`) and run exactly what the old cron
 * ran — one bounded, checkpointable page per Feed source.
 *
 * Never throws. Every outcome is data:
 * - `WithinFloor` — another firing holds a fresh claim; skip.
 * - `LeaseHeld` — another collector owns the platform's lease; the attempt
 *   stamp stays advanced (a burned window costs at most one floor of delay,
 *   and restoring it would add a second racy write), reported, not thrown.
 * - `Claimed` / `CollectFailed` — the run reports, or whatever escaped the
 *   existing failure taxonomy for the caller to log; still no throw, because
 *   this runs behind a user response that has already left.
 */
export const ingestIfDue = (
  floorMs: number = DEFAULT_ATTEMPT_FLOOR_MS,
  detailFetchesPerRun: number = PROVISIONAL_HYDRATION_PER_RUN,
): Effect.Effect<LazyOutcome, never, Database | SourceCatalog | Ingestion> =>
  Effect.gen(function* (): Effect.gen.Return<
    LazyOutcome,
    never,
    Database | SourceCatalog | Ingestion
  > {
    const now = yield* DateTime.now;
    const nowIso = DateTime.formatIso(now);
    const cutoffIso = DateTime.formatIso(DateTime.subtractDuration(now, Duration.millis(floorMs)));
    const won = yield* IngestionGateRepo.claim(NAV_PLATFORM_ID, nowIso, cutoffIso);
    if (!won) return { _tag: "WithinFloor" };

    const catalog = yield* SourceCatalog;
    const ingestion = yield* Ingestion;
    const entries = yield* catalog.list({ _tag: "Feed" });
    const reports: Array<RunReport> = [];
    let failed: unknown;
    for (const entry of entries) {
      // `Effect.exit`, not `Effect.result`: `collect`'s typed channel is
      // `LeaseHeld` only, but a *defect* (an unexpected throw inside a
      // source adapter) must also be contained here — this runs behind an
      // already-sent user response, and nothing may escape into waitUntil.
      const result = yield* Effect.exit(
        ingestion.collect(entry.id, {
          ...DEFAULT_RUN_BUDGET,
          maxDetailFetches: detailFetchesPerRun,
        }),
      );
      if (Exit.isSuccess(result)) {
        reports.push(result.value);
        continue;
      }
      if (!Exit.hasDies(result)) {
        return { _tag: "LeaseHeld" };
      }
      // Anything else has already been recorded by collect's own failure
      // taxonomy (ingestion_failures + the run ledger); surface it to the
      // caller for logging without throwing past waitUntil.
      failed = result.cause;
    }
    if (failed !== undefined) return { _tag: "CollectFailed", error: failed };
    return { _tag: "Claimed", reports };
  });
