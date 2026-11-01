import { TransitionSystem } from "@job-index/domain/TransitionSystem";
import type { TransitionRejected } from "@job-index/domain/TransitionSystem";
import type { RawListing } from "@job-index/domain/Job";
import type { ObservationContent } from "@job-index/domain/observation/Ir";
import { decideAfterPage, decideContinuation, foldPage } from "./budget.ts";
import type { SweepOutcome, WalkState } from "./budget.ts";

/**
 * The ingestion run as an explicit state machine (WS-0022 §8; lead handoff "Ingestion control flow"): a pure
 * `decide(state, event) → { state, commands }` over the existing `TransitionSystem`, executed by the thin Effect
 * interpreter in `collect.ts`, which runs each command and feeds its result back as the next event. Every event
 * carries the interpreter's clock reading (`nowMs`), so every budget decision here is a function of its inputs.
 *
 * Idle → Leasing → Positioning → (Fetching → Observing* → Committing → Checkpointing)* → [Closing] → [Hydrating] →
 * Releasing → Reporting → Recording → Done; a held lease ends in Denied. This is `collect`'s pre-WS-0022 control flow
 * exactly (pinned by the unchanged `ingestion/live.test.ts` and WS-0020 suites), plus two steps: `CommitBatch` stores
 * the page's IR observations before the checkpoint, and `HydrateDetails(n)` is bounded hydration (option A).
 *
 * Laws (`run.test.ts`, over generated environments): one command per step at most; a denied lease issues nothing
 * else; the checkpoint cursor advances only after `Committed`; a failure releases the last committed cursor; pages,
 * observations and detail fetches stay within budget; a run that acquired the lease releases it exactly once.
 */

export interface RunBudget {
  readonly maxPages: number;
  readonly maxObservations: number;
  readonly maxDurationMs: number;
  readonly leaseRecoveryMs: number;
  /**
   * Bounded hydration (option A): at most this many detail fetches per run. Absent means none: a budget is an
   * allowance, and a caller that grants no detail fetches gets none.
   */
  readonly maxDetailFetches?: number;
}

export interface Position {
  readonly cursor: string;
  readonly seenExternalIds: ReadonlyArray<string>;
  readonly resolvedSourceId: string | undefined;
}

export interface FetchedPage {
  readonly listings: ReadonlyArray<RawListing>;
  readonly cursor: string;
  readonly more: boolean;
  readonly observations: ReadonlyArray<ObservationContent>;
}

interface Run {
  readonly platform: string;
  readonly owner: string;
  readonly budget: RunBudget;
  readonly startedAtMs: number;
  readonly startCursor: string;
  readonly cursorBefore: string;
  readonly walk: WalkState;
  readonly resolvedSourceId: string | undefined;
  readonly pages: number;
  readonly observations: number;
  readonly canonicalChanges: number;
  readonly lastChangedId: string | undefined;
  readonly detailFetches: number;
}

export interface Report {
  readonly startedAtMs: number;
  readonly pages: number;
  readonly observations: number;
  readonly canonicalChanges: number;
  readonly cursorBefore: string;
  readonly cursorAfter: string;
  readonly highestSequence: number;
  readonly stoppedReason: string;
  readonly durationMs: number;
  readonly detailFetches: number;
}

export type RunState =
  | { readonly _tag: "Idle" }
  | {
      readonly _tag: "Leasing";
      readonly platform: string;
      readonly owner: string;
      readonly budget: RunBudget;
      readonly startedAtMs: number;
    }
  | { readonly _tag: "Denied"; readonly platform: string; readonly owner: string }
  | {
      readonly _tag: "Positioning";
      readonly platform: string;
      readonly owner: string;
      readonly budget: RunBudget;
      readonly startedAtMs: number;
    }
  | { readonly _tag: "Fetching"; readonly run: Run; readonly fetchStartedMs: number }
  | { readonly _tag: "RecordingFailure"; readonly run: Run; readonly outcome: SweepOutcome }
  | {
      readonly _tag: "Observing";
      readonly run: Run;
      readonly page: FetchedPage;
      readonly index: number;
    }
  | { readonly _tag: "Committing"; readonly run: Run; readonly page: FetchedPage }
  | { readonly _tag: "Checkpointing"; readonly run: Run; readonly page: FetchedPage }
  | { readonly _tag: "Closing"; readonly run: Run; readonly outcome: SweepOutcome }
  | { readonly _tag: "Hydrating"; readonly run: Run; readonly outcome: SweepOutcome }
  | { readonly _tag: "Releasing"; readonly run: Run; readonly outcome: SweepOutcome }
  | { readonly _tag: "Reporting"; readonly run: Run; readonly outcome: SweepOutcome }
  | { readonly _tag: "Recording"; readonly report: Report }
  | { readonly _tag: "Done"; readonly report: Report };

export type RunEvent =
  | {
      readonly _tag: "Triggered";
      readonly platform: string;
      readonly owner: string;
      readonly budget: RunBudget;
      readonly nowMs: number;
    }
  | { readonly _tag: "LeaseGranted"; readonly nowMs: number }
  | { readonly _tag: "LeaseDenied"; readonly holder: string; readonly nowMs: number }
  | {
      readonly _tag: "Positioned";
      readonly startCursor: string;
      readonly existing: Position | undefined;
      readonly nowMs: number;
    }
  | { readonly _tag: "PageFetched"; readonly page: FetchedPage; readonly nowMs: number }
  | { readonly _tag: "PageTimedOut"; readonly nowMs: number }
  | {
      readonly _tag: "PageFailed";
      readonly failureTag: string;
      readonly detail: string;
      readonly nowMs: number;
    }
  | { readonly _tag: "FailureRecorded"; readonly nowMs: number }
  | { readonly _tag: "Observed"; readonly changedJobId: string | undefined; readonly nowMs: number }
  | { readonly _tag: "ObserveTimedOut"; readonly nowMs: number }
  | { readonly _tag: "Committed"; readonly nowMs: number }
  | { readonly _tag: "Checkpointed"; readonly nowMs: number }
  | {
      readonly _tag: "ClosedAbsent";
      readonly changedJobIds: ReadonlyArray<string>;
      readonly nowMs: number;
    }
  | { readonly _tag: "DetailsHydrated"; readonly attempted: number; readonly nowMs: number }
  | { readonly _tag: "Released"; readonly nowMs: number }
  | {
      readonly _tag: "HighestSequenceRead";
      readonly highestSequence: number;
      readonly nowMs: number;
    }
  | { readonly _tag: "RunRecorded"; readonly nowMs: number };

export type Command =
  | {
      readonly _tag: "AcquireLease";
      readonly platform: string;
      readonly owner: string;
      readonly recoverAfterMs: number;
    }
  | { readonly _tag: "LoadPosition"; readonly platform: string }
  | {
      readonly _tag: "FetchPage";
      readonly platform: string;
      readonly cursor: string;
      readonly timeoutMs: number;
    }
  | {
      readonly _tag: "RecordFailure";
      readonly platform: string;
      readonly failureTag: string;
      readonly detail: string;
      readonly cursor: string;
      readonly occurredAtMs: number;
    }
  | { readonly _tag: "Observe"; readonly listing: RawListing; readonly timeoutMs: number }
  | {
      readonly _tag: "CommitBatch";
      readonly observations: ReadonlyArray<ObservationContent>;
      readonly runId: string;
    }
  | {
      readonly _tag: "Checkpoint";
      readonly platform: string;
      readonly walk: WalkState;
      readonly resolvedSourceId: string | undefined;
    }
  | {
      readonly _tag: "CloseAbsent";
      readonly sourceId: string;
      readonly seenExternalIds: ReadonlyArray<string>;
    }
  | {
      readonly _tag: "HydrateDetails";
      readonly platform: string;
      readonly sourceId: string;
      readonly n: number;
      readonly runId: string;
      readonly timeoutMs: number;
    }
  | {
      readonly _tag: "Release";
      readonly platform: string;
      readonly owner: string;
      readonly walk: WalkState;
      readonly resolvedSourceId: string | undefined;
    }
  | { readonly _tag: "ReadHighestSequence"; readonly canonicalJobId: string }
  | { readonly _tag: "RecordRun"; readonly platform: string; readonly report: Report };

export interface Decision {
  readonly state: RunState;
  readonly commands: ReadonlyArray<Command>;
}

const to = (state: RunState, ...commands: ReadonlyArray<Command>): Decision => ({
  state,
  commands,
});

const elapsed = (run: Run, nowMs: number): number => nowMs - run.startedAtMs;

const progress = (run: Run, nowMs: number) => ({
  pages: run.pages,
  observations: run.observations,
  elapsedMs: elapsed(run, nowMs),
});

export const stoppedReasonText = (outcome: SweepOutcome): string => {
  switch (outcome._tag) {
    case "ReachedTail":
      return "reached tail";
    case "BudgetExhausted":
      return `budget exhausted: ${outcome.boundary}`;
    case "Failed":
      return `failed: ${outcome.failureTag} (${outcome.detail})`;
  }
};

/** Fetch the next page, or end the walk if the budget says so (checked before every fetch). */
const nextPage = (run: Run, nowMs: number): Decision => {
  const continuation = decideContinuation(run.budget, progress(run, nowMs));
  if (continuation._tag === "BudgetExhausted") return afterWalk(run, continuation, nowMs);
  return to(
    { _tag: "Fetching", run, fetchStartedMs: nowMs },
    {
      _tag: "FetchPage",
      platform: run.platform,
      cursor: run.walk.cursor,
      timeoutMs: Math.max(run.budget.maxDurationMs - elapsed(run, nowMs), 0),
    },
  );
};

/** Observe the page's next listing (budget checked before each), or commit the page once all are folded. */
const nextListing = (run: Run, page: FetchedPage, index: number, nowMs: number): Decision => {
  const listing = page.listings[index];
  if (listing === undefined) {
    return to(
      { _tag: "Committing", run, page },
      { _tag: "CommitBatch", observations: page.observations, runId: run.owner },
    );
  }
  const continuation = decideContinuation(run.budget, progress(run, nowMs));
  if (continuation._tag === "BudgetExhausted") return afterWalk(run, continuation, nowMs);
  return to(
    { _tag: "Observing", run, page, index },
    { _tag: "Observe", listing, timeoutMs: run.budget.maxDurationMs - elapsed(run, nowMs) },
  );
};

/** The walk is over: close (tail only), then hydrate, then release. */
const afterWalk = (run: Run, outcome: SweepOutcome, nowMs: number): Decision => {
  if (outcome._tag === "ReachedTail") {
    if (run.resolvedSourceId !== undefined) {
      return to(
        { _tag: "Closing", run, outcome },
        {
          _tag: "CloseAbsent",
          sourceId: run.resolvedSourceId,
          seenExternalIds: outcome.seenExternalIds,
        },
      );
    }
    return afterClose(
      { ...run, walk: { cursor: run.startCursor, seenExternalIds: [] } },
      outcome,
      nowMs,
    );
  }
  return afterClose(run, outcome, nowMs);
};

/** Bounded hydration (option A): only after a walk that did not fail, with time left, for a known source. */
const afterClose = (run: Run, outcome: SweepOutcome, nowMs: number): Decision => {
  const n = Math.max(0, Math.trunc(run.budget.maxDetailFetches ?? 0));
  const remainingMs = run.budget.maxDurationMs - elapsed(run, nowMs);
  if (n > 0 && outcome._tag !== "Failed" && remainingMs > 0 && run.resolvedSourceId !== undefined) {
    return to(
      { _tag: "Hydrating", run, outcome },
      {
        _tag: "HydrateDetails",
        platform: run.platform,
        sourceId: run.resolvedSourceId,
        n,
        runId: run.owner,
        timeoutMs: remainingMs,
      },
    );
  }
  return release(run, outcome);
};

const release = (run: Run, outcome: SweepOutcome): Decision =>
  to(
    { _tag: "Releasing", run, outcome },
    {
      _tag: "Release",
      platform: run.platform,
      owner: run.owner,
      walk: run.walk,
      resolvedSourceId: run.resolvedSourceId,
    },
  );

const report = (
  run: Run,
  outcome: SweepOutcome,
  highestSequence: number,
  nowMs: number,
): Decision => {
  const finished: Report = {
    startedAtMs: run.startedAtMs,
    pages: run.pages,
    observations: run.observations,
    canonicalChanges: run.canonicalChanges,
    cursorBefore: run.cursorBefore,
    cursorAfter: run.walk.cursor,
    highestSequence,
    stoppedReason: stoppedReasonText(outcome),
    durationMs: elapsed(run, nowMs),
    detailFetches: run.detailFetches,
  };
  return to(
    { _tag: "Recording", report: finished },
    { _tag: "RecordRun", platform: run.platform, report: finished },
  );
};

type Step = (state: RunState, event: RunEvent) => Decision | undefined;

/** The transition table. `undefined` means the event does not fit the state, which the system turns into a rejection. */
const step: Step = (state, event) => {
  switch (state._tag) {
    case "Idle":
      return event._tag === "Triggered"
        ? to(
            {
              _tag: "Leasing",
              platform: event.platform,
              owner: event.owner,
              budget: event.budget,
              startedAtMs: event.nowMs,
            },
            {
              _tag: "AcquireLease",
              platform: event.platform,
              owner: event.owner,
              recoverAfterMs: event.budget.leaseRecoveryMs,
            },
          )
        : undefined;
    case "Leasing":
      if (event._tag === "LeaseDenied")
        return to({ _tag: "Denied", platform: state.platform, owner: event.holder });
      return event._tag === "LeaseGranted"
        ? to({ ...state, _tag: "Positioning" }, { _tag: "LoadPosition", platform: state.platform })
        : undefined;
    case "Positioning": {
      if (event._tag !== "Positioned") return undefined;
      const existing = event.existing;
      const run: Run = {
        platform: state.platform,
        owner: state.owner,
        budget: state.budget,
        startedAtMs: state.startedAtMs,
        startCursor: event.startCursor,
        cursorBefore: existing?.cursor ?? event.startCursor,
        walk:
          existing === undefined
            ? { cursor: event.startCursor, seenExternalIds: [] }
            : { cursor: existing.cursor, seenExternalIds: existing.seenExternalIds },
        resolvedSourceId: existing?.resolvedSourceId,
        pages: 0,
        observations: 0,
        canonicalChanges: 0,
        lastChangedId: undefined,
        detailFetches: 0,
      };
      return nextPage(run, event.nowMs);
    }
    case "Fetching": {
      const run = state.run;
      if (event._tag === "PageFetched") return nextListing(run, event.page, 0, event.nowMs);
      if (event._tag === "PageTimedOut") {
        return afterWalk(run, { _tag: "BudgetExhausted", boundary: "duration" }, event.nowMs);
      }
      if (event._tag === "PageFailed") {
        return to(
          {
            _tag: "RecordingFailure",
            run,
            outcome: { _tag: "Failed", failureTag: event.failureTag, detail: event.detail },
          },
          {
            _tag: "RecordFailure",
            platform: run.platform,
            failureTag: event.failureTag,
            detail: event.detail,
            cursor: run.walk.cursor,
            occurredAtMs: state.fetchStartedMs,
          },
        );
      }
      return undefined;
    }
    case "RecordingFailure":
      return event._tag === "FailureRecorded"
        ? afterWalk(state.run, state.outcome, event.nowMs)
        : undefined;
    case "Observing": {
      const listing = state.page.listings[state.index] as RawListing;
      if (event._tag === "ObserveTimedOut") {
        return afterWalk(state.run, { _tag: "BudgetExhausted", boundary: "duration" }, event.nowMs);
      }
      if (event._tag !== "Observed") return undefined;
      const run: Run = {
        ...state.run,
        resolvedSourceId: state.run.resolvedSourceId ?? listing.sourceId,
        observations: state.run.observations + 1,
        canonicalChanges: state.run.canonicalChanges + (event.changedJobId === undefined ? 0 : 1),
        lastChangedId: event.changedJobId ?? state.run.lastChangedId,
      };
      return nextListing(run, state.page, state.index + 1, event.nowMs);
    }
    case "Committing": {
      if (event._tag !== "Committed") return undefined;
      // The cursor's only advance point: after every listing folded and the page's observations committed.
      const run: Run = {
        ...state.run,
        walk: foldPage(state.run.walk, state.page),
        pages: state.run.pages + 1,
      };
      return to(
        { _tag: "Checkpointing", run, page: state.page },
        {
          _tag: "Checkpoint",
          platform: run.platform,
          walk: run.walk,
          resolvedSourceId: run.resolvedSourceId,
        },
      );
    }
    case "Checkpointing": {
      if (event._tag !== "Checkpointed") return undefined;
      const decided = decideAfterPage(
        state.run.budget,
        progress(state.run, event.nowMs),
        state.page,
        state.run.walk.seenExternalIds,
      );
      return decided === undefined
        ? nextPage(state.run, event.nowMs)
        : afterWalk(state.run, decided, event.nowMs);
    }
    case "Closing": {
      if (event._tag !== "ClosedAbsent") return undefined;
      const run: Run = {
        ...state.run,
        canonicalChanges: state.run.canonicalChanges + event.changedJobIds.length,
        lastChangedId:
          event.changedJobIds[event.changedJobIds.length - 1] ?? state.run.lastChangedId,
        // The sweep is complete: the next run starts a fresh one.
        walk: { cursor: state.run.startCursor, seenExternalIds: [] },
      };
      return afterClose(run, state.outcome, event.nowMs);
    }
    case "Hydrating":
      return event._tag === "DetailsHydrated"
        ? release(
            { ...state.run, detailFetches: state.run.detailFetches + event.attempted },
            state.outcome,
          )
        : undefined;
    case "Releasing":
      if (event._tag !== "Released") return undefined;
      return state.run.lastChangedId === undefined
        ? report(state.run, state.outcome, 0, event.nowMs)
        : to(
            { _tag: "Reporting", run: state.run, outcome: state.outcome },
            { _tag: "ReadHighestSequence", canonicalJobId: state.run.lastChangedId },
          );
    case "Reporting":
      return event._tag === "HighestSequenceRead"
        ? report(state.run, state.outcome, event.highestSequence, event.nowMs)
        : undefined;
    case "Recording":
      return event._tag === "RunRecorded" ? to({ _tag: "Done", report: state.report }) : undefined;
    case "Denied":
    case "Done":
      return undefined;
  }
};

/** The interpreter is the only authority that feeds this machine. */
export type Authority = "interpreter";

const machine = TransitionSystem.make<Decision, RunEvent, Authority>({
  transition: (previous, event, authority) =>
    step(previous.state, event) ??
    TransitionSystem.reject(
      previous,
      event,
      authority,
      `${event._tag} does not apply in ${previous.state._tag}`,
    ),
});

/** `decide(state, event) → { state, commands }`, or a typed rejection when the event does not fit the state. */
export const decide = (
  state: RunState,
  event: RunEvent,
): Decision | TransitionRejected<Decision, RunEvent, Authority> => {
  const result = machine.apply({ state, commands: [] }, event, "interpreter");
  return result._tag === "Accepted" ? result.state : result;
};

export const initial: RunState = { _tag: "Idle" };

export const isTerminal = (state: RunState): boolean =>
  state._tag === "Done" || state._tag === "Denied";

/**
 * What the interpreter must still run if the run dies while holding the lease (a defect or an interruption): the
 * pre-WS-0022 `Effect.ensuring(release)`, made a pure function of the state. `undefined` when the lease is not held.
 */
export const releaseOnAbort = (state: RunState): Command | undefined => {
  switch (state._tag) {
    case "Fetching":
    case "RecordingFailure":
    case "Observing":
    case "Committing":
    case "Checkpointing":
    case "Closing":
    case "Hydrating":
      return {
        _tag: "Release",
        platform: state.run.platform,
        owner: state.run.owner,
        walk: state.run.walk,
        resolvedSourceId: state.run.resolvedSourceId,
      };
    // Not `Positioning`: before the position is loaded there is no walk to persist, and the pre-WS-0022 `ensuring`
    // did not cover that step either (the lease's recovery alarm reclaims it).
    default:
      return undefined;
  }
};
