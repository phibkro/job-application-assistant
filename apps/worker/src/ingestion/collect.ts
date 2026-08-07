import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schedule from "effect/Schedule";
import { IngestionFailure, IngestionRun } from "@job-index/domain/Ingestion";
import type { CanonicalJobId, PlatformId, Sequence, SourceId } from "@job-index/domain/Ids";
import type { CatalogEntry } from "@job-index/domain/Source";
import { LeaseHeld } from "@job-index/domain/Failure";
import type { Acquisition } from "../services/Acquisition.ts";
import type { Corpus } from "../services/Corpus.ts";
import { Database } from "../services/Database.ts";
import type { SourceCatalog } from "../services/SourceCatalog.ts";
import type { RunBudget, RunReport } from "../services/Ingestion.ts";
import { normalize } from "../corpus/index.ts";
import * as SourceStateRepo from "../db/repositories/SourceState.ts";
import * as IngestionRunsRepo from "../db/repositories/IngestionRuns.ts";
import * as IngestionFailuresRepo from "../db/repositories/IngestionFailures.ts";
import { decideAfterPage, decideContinuation, foldPage } from "./budget.ts";
import type { WalkState } from "./budget.ts";
import { describeFailure, isRetryable } from "./failureDetail.ts";
import type { PageFailure } from "./failureDetail.ts";

type AcquisitionShape = Effect.Success<typeof Acquisition>;
type CorpusShape = Effect.Success<typeof Corpus>;
type SourceCatalogShape = Effect.Success<typeof SourceCatalog>;
type DatabaseShape = Effect.Success<typeof Database>;

export interface CollectDeps {
  readonly database: DatabaseShape;
  readonly acquisition: AcquisitionShape;
  readonly corpus: CorpusShape;
  readonly sourceCatalog: SourceCatalogShape;
}

/** Bounded retry with backoff for a transient page failure — SQLite/D1 aside, the one place this slot reaches for `Schedule`. */
const RETRY_SCHEDULE = Schedule.exponential("200 millis");

/**
 * One page, retried a bounded number of times on a transient failure, and
 * bounded overall by whatever's left of the run's wall-clock budget — a
 * single stuck fetch must not silently consume the entire duration budget
 * while `pages`/`observations` sit unchanged.
 */
const fetchPage = (
  acquisition: AcquisitionShape,
  platform: PlatformId,
  cursor: string,
  remainingMs: number,
) =>
  Effect.retry(acquisition.page(platform, cursor), {
    schedule: RETRY_SCHEDULE,
    times: 2,
    while: isRetryable,
  }).pipe(Effect.timeout(Math.max(remainingMs, 0)));

/**
 * `Ingestion.collect`'s implementation. Acquires the lease, walks pages
 * within budget, checkpoints each fully-folded page, closes absent
 * occurrences only when the walk actually reached the tail, and always
 * releases the lease — success, budget exhaustion, or failure alike.
 */
export const makeCollect =
  (deps: CollectDeps) =>
  (platform: PlatformId, budget: RunBudget): Effect.Effect<RunReport, LeaseHeld> =>
    Effect.gen(function* () {
      const owner = crypto.randomUUID();
      const startedAt = yield* DateTime.now;

      // The catalogue is this platform's one durable fact Ingestion needs
      // beyond what Acquisition already resolves for itself: where a
      // never-before-collected platform's sweep begins. `Acquisition.page`
      // resolves *tier* from the same catalogue independently; asking here
      // too is not a duplicate lookup of the same question, it's a different
      // one ("where do I start" vs "how do I read this platform").
      const catalog = yield* deps.sourceCatalog.list();
      const startCursor =
        catalog.find((entry: CatalogEntry) => entry.id === platform)?.listingsUrl ?? "";

      const state = yield* Effect.provideService(
        SourceStateRepo.acquireLease({
          platformId: platform,
          owner,
          leaseTtlMs: budget.leaseTtlMs,
          startCursor,
          now: startedAt,
        }),
        Database,
        deps.database,
      );
      const heldBy = SourceStateRepo.ownerOf(state);
      if (heldBy !== owner) {
        return yield* Effect.fail(new LeaseHeld({ source: platform, owner: heldBy ?? "unknown" }));
      }

      const cursorBefore = state.cursor;
      let walk: WalkState = { cursor: state.cursor, seenExternalIds: state.seenExternalIds };
      let resolvedSourceId: SourceId | undefined = Option.getOrUndefined(state.resolvedSourceId);
      let pages = 0;
      let observations = 0;
      let canonicalChanges = 0;
      let lastChangedId: CanonicalJobId | undefined;

      // The finalizer reads `walk`/`resolvedSourceId` at the moment it runs
      // (via closure, not by capturing a value now), so whatever the loop
      // below last set — mid-sweep progress, or the reset-to-start state a
      // completed sweep leaves behind — is exactly what gets persisted,
      // regardless of which branch below actually produced it.
      const release = Effect.suspend(() =>
        Effect.provideService(
          Effect.gen(function* () {
            const now = yield* DateTime.now;
            yield* SourceStateRepo.finish(
              platform,
              owner,
              walk.cursor,
              walk.seenExternalIds,
              resolvedSourceId,
              now,
            );
          }),
          Database,
          deps.database,
        ),
      );

      const sweepOutcome = yield* Effect.gen(function* () {
        while (true) {
          const now = yield* DateTime.now;
          const elapsedMs = DateTime.toEpochMillis(now) - DateTime.toEpochMillis(startedAt);
          const continuation = decideContinuation(budget, { pages, observations, elapsedMs });
          if (continuation._tag === "BudgetExhausted") {
            return continuation;
          }

          const remainingMs = budget.maxDurationMs - elapsedMs;
          const attempt = yield* Effect.result(
            fetchPage(deps.acquisition, platform, walk.cursor, remainingMs),
          );
          if (Result.isFailure(attempt)) {
            const failure = attempt.failure;
            if (failure._tag === "TimeoutError") {
              return { _tag: "BudgetExhausted", boundary: "duration" } as const;
            }
            const pageFailure = failure as PageFailure;
            yield* Effect.provideService(
              IngestionFailuresRepo.record(
                new IngestionFailure({
                  platformId: platform,
                  occurredAt: now,
                  failureTag: pageFailure._tag,
                  detail: describeFailure(pageFailure),
                  cursor: walk.cursor,
                }),
              ),
              Database,
              deps.database,
            );
            return {
              _tag: "Failed",
              failureTag: pageFailure._tag,
              detail: describeFailure(pageFailure),
            } as const;
          }
          const page = attempt.success;

          for (const raw of page.listings) {
            resolvedSourceId ??= raw.sourceId;
            const outcome = yield* deps.corpus.observe(normalize(raw));
            if (outcome._tag !== "Unchanged") {
              canonicalChanges += 1;
              lastChangedId = outcome.id;
            }
          }

          walk = foldPage(walk, page);
          pages += 1;
          observations += page.listings.length;

          const checkpointNow = yield* DateTime.now;
          yield* Effect.provideService(
            SourceStateRepo.checkpoint(
              platform,
              owner,
              walk.cursor,
              walk.seenExternalIds,
              resolvedSourceId,
              checkpointNow,
            ),
            Database,
            deps.database,
          );

          const decided = decideAfterPage(
            budget,
            {
              pages,
              observations,
              elapsedMs: DateTime.toEpochMillis(checkpointNow) - DateTime.toEpochMillis(startedAt),
            },
            page,
            walk.seenExternalIds,
          );
          if (decided !== undefined) {
            return decided;
          }
        }
      }).pipe(Effect.ensuring(release));

      // `closeAbsent` is reachable from exactly one branch: `ReachedTail` is
      // the only variant with a `seenExternalIds` field to pass it. A
      // `BudgetExhausted` or `Failed` value has nowhere to read that argument
      // from — there is no `if` here guarding the call, because there is no
      // way to *write* the call against the other two branches at all.
      if (sweepOutcome._tag === "ReachedTail") {
        if (resolvedSourceId !== undefined) {
          const closeOutcomes = yield* deps.corpus.closeAbsent(
            resolvedSourceId,
            sweepOutcome.seenExternalIds,
          );
          for (const outcome of closeOutcomes) {
            if (outcome._tag === "Unchanged") continue;
            canonicalChanges += 1;
            lastChangedId = outcome.id;
          }
        }
        // The sweep is complete: the next run starts a fresh one, from the
        // beginning, rather than resuming a cursor that has nothing left to
        // resume.
        walk = { cursor: startCursor, seenExternalIds: [] };
      }

      const highestSequence: Sequence =
        lastChangedId === undefined
          ? (0 as Sequence)
          : ((yield* deps.corpus.get(lastChangedId))?.sequence ?? (0 as Sequence));

      const durationMs =
        DateTime.toEpochMillis(yield* DateTime.now) - DateTime.toEpochMillis(startedAt);
      const stoppedReason = stoppedReasonText(sweepOutcome);

      yield* Effect.provideService(
        IngestionRunsRepo.record(
          new IngestionRun({
            platformId: platform,
            startedAt,
            pages,
            observations,
            canonicalChanges,
            cursorBefore,
            cursorAfter: walk.cursor,
            highestSequence,
            stoppedReason,
            durationMs,
          }),
        ),
        Database,
        deps.database,
      );

      return {
        pages,
        observations,
        canonicalChanges,
        cursorBefore,
        cursorAfter: walk.cursor,
        highestSequence,
        stoppedReason,
        durationMs,
      };
    });

const stoppedReasonText = (
  outcome:
    | { readonly _tag: "ReachedTail"; readonly seenExternalIds: ReadonlyArray<string> }
    | { readonly _tag: "BudgetExhausted"; readonly boundary: "pages" | "observations" | "duration" }
    | { readonly _tag: "Failed"; readonly failureTag: string; readonly detail: string },
): string => {
  switch (outcome._tag) {
    case "ReachedTail":
      return "reached tail";
    case "BudgetExhausted":
      return `budget exhausted: ${outcome.boundary}`;
    case "Failed":
      return `failed: ${outcome.failureTag} (${outcome.detail})`;
  }
};
