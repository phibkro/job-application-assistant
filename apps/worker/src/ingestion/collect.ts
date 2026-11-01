import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
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
import type { Ids } from "../services/Ids.ts";
import type { SourceCatalog } from "../services/SourceCatalog.ts";
import type { SourceLease } from "../services/SourceLease.ts";
import type { RunBudget, RunReport } from "../services/Ingestion.ts";
import type { ObservationContent } from "@job-index/domain/observation/Ir";
import type { WalkState } from "./budget.ts";
import { normalize } from "../corpus/index.ts";
import * as SourceStateRepo from "../db/repositories/SourceState.ts";
import * as IngestionRunsRepo from "../db/repositories/IngestionRuns.ts";
import * as IngestionFailuresRepo from "../db/repositories/IngestionFailures.ts";
import * as ObservationStore from "../observations/store.ts";
import * as WorkloadProjection from "../observations/projection.ts";
import { describeFailure, isRetryable } from "./failureDetail.ts";
import type { PageFailure } from "./failureDetail.ts";
import { decide, initial, isTerminal, releaseOnAbort } from "./run.ts";
import type { Command, Decision, RunEvent, RunState } from "./run.ts";

type AcquisitionShape = Effect.Success<typeof Acquisition>;
type CorpusShape = Effect.Success<typeof Corpus>;
type SourceCatalogShape = Effect.Success<typeof SourceCatalog>;
type DatabaseShape = Effect.Success<typeof Database>;
type SourceLeaseShape = Effect.Success<typeof SourceLease>;
type IdsShape = Effect.Success<typeof Ids>;

export interface CollectDeps {
  readonly database: DatabaseShape;
  readonly acquisition: AcquisitionShape;
  readonly corpus: CorpusShape;
  readonly sourceCatalog: SourceCatalogShape;
  readonly sourceLease: SourceLeaseShape;
  readonly ids: IdsShape;
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

/** One transition; a rejected event is a defect: the interpreter fed the machine something it never issued for. */
const step = (state: RunState, event: RunEvent): Effect.Effect<Decision> => {
  const decided = decide(state, event);
  return "_tag" in decided ? Effect.die(decided) : Effect.succeed(decided);
};

/**
 * `Ingestion.collect`'s implementation: the thin Effect interpreter of the pure run machine in `run.ts` (WS-0022 §8).
 * It runs one command at a time, stamps the clock on the event it feeds back, and owns nothing but effects. Every
 * decision (budget, when to checkpoint, when to close, when to hydrate, what to release) is `decide`'s.
 *
 * The behaviour is the pre-WS-0022 `collect` exactly: the platform's `SourceLease` Durable Object is asked first, so a
 * denied caller leaves no trace; pages are walked within budget; each fully folded page is checkpointed; absent
 * occurrences close only when the walk reached the tail; and the final position is persisted and the lease released,
 * in that order, on success, budget exhaustion, failure or a defect (`releaseOnAbort`). Two steps are new: the page's
 * IR observations are committed to the append-only store before its checkpoint, and `HydrateDetails(n)` fetches at
 * most `budget.maxDetailFetches` details into the store (bounded hydration, option A).
 */
export const makeCollect =
  (deps: CollectDeps) =>
  (platform: PlatformId, budget: RunBudget): Effect.Effect<RunReport, LeaseHeld> =>
    Effect.gen(function* () {
      const owner = yield* deps.ids.next;
      const withDatabase = <A>(effect: Effect.Effect<A, never, Database>): Effect.Effect<A> =>
        Effect.provideService(effect, Database, deps.database);
      const nowMs = Effect.map(DateTime.now, DateTime.toEpochMillis);

      const execute = (command: Command): Effect.Effect<RunEvent> =>
        Effect.gen(function* (): Effect.gen.Return<RunEvent> {
          switch (command._tag) {
            case "AcquireLease": {
              const outcome = yield* deps.sourceLease.acquire(
                platform,
                owner,
                command.recoverAfterMs,
              );
              return outcome._tag === "Held"
                ? { _tag: "LeaseDenied", holder: outcome.owner, nowMs: yield* nowMs }
                : { _tag: "LeaseGranted", nowMs: yield* nowMs };
            }
            case "LoadPosition": {
              // The catalogue is this platform's one durable fact Ingestion needs beyond what Acquisition already
              // resolves for itself: where a never-before-collected platform's sweep begins. The feed URL when the
              // catalogue records one, because a platform's machine-readable endpoint is frequently not its human one.
              const catalog = yield* deps.sourceCatalog.list();
              const entry = catalog.find((candidate: CatalogEntry) => candidate.id === platform);
              const startCursor = entry?.feedUrl ?? entry?.listingsUrl ?? "";
              const existing = yield* withDatabase(SourceStateRepo.find(platform));
              return {
                _tag: "Positioned",
                startCursor,
                existing:
                  existing === undefined
                    ? undefined
                    : {
                        cursor: existing.cursor,
                        seenExternalIds: existing.seenExternalIds,
                        resolvedSourceId: Option.getOrUndefined(existing.resolvedSourceId),
                      },
                nowMs: yield* nowMs,
              };
            }
            case "FetchPage": {
              const attempt = yield* Effect.result(
                fetchPage(deps.acquisition, platform, command.cursor, command.timeoutMs),
              );
              if (Result.isSuccess(attempt)) {
                const page = attempt.success;
                return {
                  _tag: "PageFetched",
                  page: {
                    listings: page.listings,
                    cursor: page.cursor,
                    more: page.more,
                    observations: page.observations ?? [],
                  },
                  nowMs: yield* nowMs,
                };
              }
              if (attempt.failure._tag === "TimeoutError")
                return { _tag: "PageTimedOut", nowMs: yield* nowMs };
              const failure = attempt.failure as PageFailure;
              return {
                _tag: "PageFailed",
                failureTag: failure._tag,
                detail: describeFailure(failure),
                nowMs: yield* nowMs,
              };
            }
            case "RecordFailure": {
              yield* withDatabase(
                IngestionFailuresRepo.record(
                  new IngestionFailure({
                    platformId: platform,
                    occurredAt: DateTime.makeUnsafe(command.occurredAtMs),
                    failureTag: command.failureTag,
                    detail: command.detail,
                    cursor: command.cursor,
                  }),
                ),
              );
              return { _tag: "FailureRecorded", nowMs: yield* nowMs };
            }
            case "Observe": {
              const observed = yield* Effect.result(
                deps.corpus
                  .observe(normalize(command.listing))
                  .pipe(Effect.timeout(command.timeoutMs)),
              );
              if (Result.isFailure(observed))
                return { _tag: "ObserveTimedOut", nowMs: yield* nowMs };
              const outcome = observed.success;
              return {
                _tag: "Observed",
                changedJobId: outcome._tag === "Unchanged" ? undefined : outcome.id,
                nowMs: yield* nowMs,
              };
            }
            case "CommitBatch": {
              yield* commitObservations(command.observations, command.runId);
              return { _tag: "Committed", nowMs: yield* nowMs };
            }
            case "Checkpoint": {
              yield* checkpoint(command.walk, command.resolvedSourceId);
              return { _tag: "Checkpointed", nowMs: yield* nowMs };
            }
            case "CloseAbsent": {
              const outcomes = yield* deps.corpus.closeAbsent(
                command.sourceId as SourceId,
                command.seenExternalIds,
              );
              return {
                _tag: "ClosedAbsent",
                changedJobIds: outcomes.flatMap((closed) =>
                  closed._tag === "Unchanged" ? [] : [closed.id],
                ),
                nowMs: yield* nowMs,
              };
            }
            case "HydrateDetails": {
              const attempted = yield* hydrateDetails(command);
              return { _tag: "DetailsHydrated", attempted, nowMs: yield* nowMs };
            }
            case "Release": {
              yield* checkpoint(command.walk, command.resolvedSourceId);
              yield* deps.sourceLease.release(platform, owner);
              return { _tag: "Released", nowMs: yield* nowMs };
            }
            case "ReadHighestSequence": {
              const job = yield* deps.corpus.get(command.canonicalJobId as CanonicalJobId);
              return {
                _tag: "HighestSequenceRead",
                highestSequence: job?.sequence ?? 0,
                nowMs: yield* nowMs,
              };
            }
            case "RecordRun": {
              const report = command.report;
              yield* withDatabase(
                IngestionRunsRepo.record(
                  new IngestionRun({
                    platformId: platform,
                    startedAt: DateTime.makeUnsafe(report.startedAtMs),
                    pages: report.pages,
                    observations: report.observations,
                    canonicalChanges: report.canonicalChanges,
                    cursorBefore: report.cursorBefore,
                    cursorAfter: report.cursorAfter,
                    highestSequence: report.highestSequence as Sequence,
                    stoppedReason: report.stoppedReason,
                    durationMs: report.durationMs,
                  }),
                ),
              );
              return { _tag: "RunRecorded", nowMs: yield* nowMs };
            }
          }
        });

      const checkpoint = (walk: WalkState, resolvedSourceId: string | undefined) =>
        Effect.gen(function* () {
          const now = yield* DateTime.now;
          yield* withDatabase(
            SourceStateRepo.checkpoint(
              platform,
              walk.cursor,
              walk.seenExternalIds,
              resolvedSourceId as SourceId | undefined,
              now,
            ),
          );
        });

      /** Append to the observation store, then refresh the workload rows of the vacancies it touched. */
      const commitObservations = (observations: ReadonlyArray<ObservationContent>, runId: string) =>
        Effect.gen(function* () {
          if (observations.length === 0) return;
          const recordedAt = DateTime.formatIso(yield* DateTime.now);
          yield* withDatabase(ObservationStore.append(observations, { runId, recordedAt }));
          yield* withDatabase(WorkloadProjection.refresh(observations));
        });

      /**
       * Bounded hydration (option A): at most `n` detail fetches, newest-recorded candidates first, each within what
       * is left of the run's time. A failed fetch is skipped, not retried: the next run offers the candidate again.
       */
      const hydrateDetails = (command: Extract<Command, { readonly _tag: "HydrateDetails" }>) =>
        Effect.gen(function* () {
          const deadline = (yield* nowMs) + command.timeoutMs;
          const candidates = yield* withDatabase(
            ObservationStore.hydrationCandidates(command.sourceId, command.n),
          );
          let attempted = 0;
          for (const externalId of candidates) {
            const remaining = deadline - (yield* nowMs);
            if (remaining <= 0) break;
            attempted += 1;
            const fetched = yield* Effect.result(
              deps.acquisition.hydrate(platform, externalId).pipe(Effect.timeout(remaining)),
            );
            if (Result.isFailure(fetched)) {
              yield* Effect.logWarning("bounded hydration: detail fetch failed", {
                platform,
                externalId,
                failure: fetched.failure._tag,
              });
              continue;
            }
            const observation = fetched.success.observation;
            if (observation !== undefined) yield* commitObservations([observation], command.runId);
          }
          return attempted;
        });

      let decision = yield* step(initial, {
        _tag: "Triggered",
        platform,
        owner,
        budget,
        nowMs: yield* nowMs,
      });
      const loop = Effect.gen(function* () {
        while (!isTerminal(decision.state)) {
          const command = decision.commands[0];
          if (command === undefined) {
            return yield* Effect.die(
              new Error(`ingestion run: no command in state ${decision.state._tag}`),
            );
          }
          decision = yield* step(decision.state, yield* execute(command));
        }
      });
      // A run that dies holding the lease still persists its last safe position and releases (the pre-WS-0022
      // `Effect.ensuring(release)`, now a pure function of the state).
      yield* loop.pipe(
        Effect.onExit((exit) => {
          const abort = Exit.isSuccess(exit) ? undefined : releaseOnAbort(decision.state);
          return abort === undefined ? Effect.void : Effect.asVoid(execute(abort));
        }),
      );

      const final = decision.state;
      if (final._tag === "Denied") {
        return yield* Effect.fail(new LeaseHeld({ source: platform, owner: final.owner }));
      }
      if (final._tag !== "Done") {
        return yield* Effect.die(new Error(`ingestion run ended in ${final._tag}`));
      }
      const report = final.report;
      return {
        pages: report.pages,
        observations: report.observations,
        canonicalChanges: report.canonicalChanges,
        cursorBefore: report.cursorBefore,
        cursorAfter: report.cursorAfter,
        highestSequence: report.highestSequence as Sequence,
        stoppedReason: report.stoppedReason,
        durationMs: report.durationMs,
        detailFetches: report.detailFetches,
      };
    });
