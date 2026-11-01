import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import type { RawListing } from "@job-index/domain/Job";
import { decide, initial, isTerminal, releaseOnAbort } from "./run.ts";
import type { Command, Decision, RunBudget, RunEvent, RunState } from "./run.ts";

/**
 * Laws over the pure ingestion-run machine (WS-0022 §8, lead handoff "Ingestion control flow"): no concurrent runs,
 * the checkpoint advances only on `Committed`, a failure keeps the last safe cursor, and runs stay within budget.
 * Each law is checked over generated environments: pages, failures, timeouts, clocks and budgets.
 */

const listing = (externalId: string): RawListing => ({
  sourceId: "nav" as RawListing["sourceId"],
  sourceName: "NAV",
  platformId: "arbeidsplassen-nav" as RawListing["platformId"],
  externalId,
  title: "t",
  employerName: "e",
  location: "l",
  description: "d",
  applicationUrl: "https://example.test",
  publishedAt: "2026-08-05T08:00:00Z",
  deadline: undefined,
  hydrated: false,
});

interface PageScript {
  readonly outcome: "ok" | "timeout" | "fail";
  readonly listings: number;
  readonly more: boolean;
  readonly observeTimesOut: boolean;
}

interface Scenario {
  readonly denied: boolean;
  readonly existing: boolean;
  readonly budget: RunBudget;
  readonly pages: ReadonlyArray<PageScript>;
  readonly stepMs: number;
  readonly changes: boolean;
}

const arbScenario: fc.Arbitrary<Scenario> = fc.record({
  denied: fc.boolean(),
  existing: fc.boolean(),
  budget: fc.record({
    maxPages: fc.integer({ min: 0, max: 4 }),
    maxObservations: fc.integer({ min: 0, max: 8 }),
    maxDurationMs: fc.integer({ min: 1, max: 200 }),
    leaseRecoveryMs: fc.constant(60_000),
    maxDetailFetches: fc.option(fc.integer({ min: 0, max: 6 }), { nil: undefined }),
  }),
  pages: fc.array(
    fc.record({
      outcome: fc.constantFrom("ok", "ok", "ok", "timeout", "fail"),
      listings: fc.integer({ min: 0, max: 3 }),
      more: fc.boolean(),
      observeTimesOut: fc.integer({ min: 0, max: 4 }).map((n) => n === 0),
    }),
    { minLength: 1, maxLength: 6 },
  ),
  stepMs: fc.integer({ min: 0, max: 30 }),
  changes: fc.boolean(),
});

interface Trace {
  readonly commands: ReadonlyArray<Command>;
  readonly events: ReadonlyArray<RunEvent>;
  readonly decisions: ReadonlyArray<Decision>;
  readonly final: RunState;
}

/** Plays the scenario as the interpreter would, one command at a time. */
const play = (s: Scenario): Trace => {
  let clock = 0;
  const tick = () => (clock += s.stepMs);
  let pageIndex = 0;
  const commands: Array<Command> = [];
  const events: Array<RunEvent> = [];
  const decisions: Array<Decision> = [];
  const apply = (state: RunState, event: RunEvent): Decision => {
    const d = decide(state, event);
    if ("_tag" in d) throw new Error(d.reason);
    events.push(event);
    decisions.push(d);
    return d;
  };
  let d = apply(initial, {
    _tag: "Triggered",
    platform: "p",
    owner: "run-1",
    budget: s.budget,
    nowMs: clock,
  });
  for (let guard = 0; !isTerminal(d.state); guard += 1) {
    if (guard > 500) throw new Error("did not terminate");
    expect(d.commands.length).toBe(1);
    const command = d.commands[0]!;
    commands.push(command);
    const now = tick();
    const event = ((): RunEvent => {
      switch (command._tag) {
        case "AcquireLease":
          return s.denied
            ? { _tag: "LeaseDenied", holder: "other", nowMs: now }
            : { _tag: "LeaseGranted", nowMs: now };
        case "LoadPosition":
          return {
            _tag: "Positioned",
            startCursor: "start",
            existing: s.existing
              ? { cursor: "resume", seenExternalIds: ["old"], resolvedSourceId: "nav" }
              : undefined,
            nowMs: now,
          };
        case "FetchPage": {
          const page = s.pages[pageIndex % s.pages.length]!;
          pageIndex += 1;
          if (page.outcome === "timeout") return { _tag: "PageTimedOut", nowMs: now };
          if (page.outcome === "fail")
            return { _tag: "PageFailed", failureTag: "SourceUnavailable", detail: "x", nowMs: now };
          return {
            _tag: "PageFetched",
            page: {
              listings: Array.from({ length: page.listings }, (_, i) =>
                listing(`p${pageIndex}-${i}`),
              ),
              cursor: `page-${pageIndex}`,
              more: page.more,
              observations: [],
            },
            nowMs: now,
          };
        }
        case "RecordFailure":
          return { _tag: "FailureRecorded", nowMs: now };
        case "Observe": {
          const page = s.pages[(pageIndex - 1) % s.pages.length]!;
          return page.observeTimesOut
            ? { _tag: "ObserveTimedOut", nowMs: now }
            : {
                _tag: "Observed",
                changedJobId: s.changes ? `job-${command.listing.externalId}` : undefined,
                nowMs: now,
              };
        }
        case "CommitBatch":
          return { _tag: "Committed", nowMs: now };
        case "Checkpoint":
          return { _tag: "Checkpointed", nowMs: now };
        case "CloseAbsent":
          return { _tag: "ClosedAbsent", changedJobIds: [], nowMs: now };
        case "HydrateDetails":
          return { _tag: "DetailsHydrated", attempted: command.n, nowMs: now };
        case "Release":
          return { _tag: "Released", nowMs: now };
        case "ReadHighestSequence":
          return { _tag: "HighestSequenceRead", highestSequence: 7, nowMs: now };
        case "RecordRun":
          return { _tag: "RunRecorded", nowMs: now };
      }
    })();
    d = apply(d.state, event);
  }
  return { commands, events, decisions, final: d.state };
};

const count = (trace: Trace, tag: Command["_tag"]) =>
  trace.commands.filter((c) => c._tag === tag).length;

describe("ingestion run machine: laws", () => {
  it("law: one command per step, and every run terminates in Done or Denied", () => {
    fc.assert(
      fc.property(arbScenario, (s) => {
        const trace = play(s);
        expect(["Done", "Denied"]).toContain(trace.final._tag);
        expect(trace.decisions.every((d) => d.commands.length <= 1)).toBe(true);
      }),
    );
  });

  it("law: no concurrent runs, a denied lease issues no other command and touches no state", () => {
    fc.assert(
      fc.property(arbScenario, (s) => {
        const trace = play({ ...s, denied: true });
        expect(trace.commands.map((c) => c._tag)).toEqual(["AcquireLease"]);
        expect(trace.final._tag).toBe("Denied");
      }),
    );
  });

  it("law: the checkpoint advances only on Committed, to the page just committed", () => {
    fc.assert(
      fc.property(arbScenario, (s) => {
        const trace = play({ ...s, denied: false });
        trace.commands.forEach((c, i) => {
          if (c._tag !== "Checkpoint") return;
          expect(trace.commands[i - 1]?._tag).toBe("CommitBatch");
          expect(trace.events[i]?._tag).toBe("Committed");
          const fetched = trace.events.slice(0, i).findLast((e) => e._tag === "PageFetched");
          expect(fetched?._tag === "PageFetched" && fetched.page.cursor).toBe(c.walk.cursor);
        });
      }),
    );
  });

  it("law: a failure, a timeout or an exhausted budget releases the last committed cursor", () => {
    fc.assert(
      fc.property(arbScenario, (s) => {
        const trace = play({ ...s, denied: false });
        const release = trace.commands.find((c) => c._tag === "Release");
        expect(count(trace, "Release")).toBe(1);
        if (release?._tag !== "Release") return;
        const closed = trace.commands.some((c) => c._tag === "CloseAbsent");
        const reachedTail = trace.decisions.some(
          (d) => "outcome" in d.state && d.state.outcome._tag === "ReachedTail",
        );
        const lastCheckpoint = trace.commands.findLast((c) => c._tag === "Checkpoint");
        const safe =
          lastCheckpoint?._tag === "Checkpoint"
            ? lastCheckpoint.walk.cursor
            : s.existing
              ? "resume"
              : "start";
        expect(release.walk.cursor).toBe(reachedTail || closed ? "start" : safe);
      }),
    );
  });

  it("law: within budget, pages, observations and detail fetches never exceed what the budget grants", () => {
    fc.assert(
      fc.property(arbScenario, (s) => {
        const trace = play({ ...s, denied: false });
        expect(count(trace, "FetchPage")).toBeLessThanOrEqual(s.budget.maxPages);
        expect(count(trace, "Observe")).toBeLessThanOrEqual(s.budget.maxObservations);
        const hydrations = trace.commands.filter((c) => c._tag === "HydrateDetails");
        expect(hydrations.length).toBeLessThanOrEqual(1);
        for (const h of hydrations) {
          expect(h._tag === "HydrateDetails" && h.n).toBeLessThanOrEqual(
            s.budget.maxDetailFetches ?? 0,
          );
          expect(h._tag === "HydrateDetails" && h.n).toBeGreaterThan(0);
        }
        if (trace.commands.some((c) => c._tag === "RecordFailure")) expect(hydrations).toEqual([]);
      }),
    );
  });

  it("law: only a walk that reached the tail closes anything", () => {
    fc.assert(
      fc.property(arbScenario, (s) => {
        const trace = play({ ...s, denied: false });
        trace.commands.forEach((c, i) => {
          if (c._tag !== "CloseAbsent") return;
          const fetched = trace.events.slice(0, i).findLast((e) => e._tag === "PageFetched");
          expect(fetched?._tag === "PageFetched" && fetched.page.more).toBe(false);
        });
      }),
    );
  });

  it("releaseOnAbort: exactly the states that hold the lease and have a walk to persist", () => {
    fc.assert(
      fc.property(arbScenario, (s) => {
        const trace = play({ ...s, denied: false });
        for (const d of trace.decisions) {
          const holds = [
            "Fetching",
            "RecordingFailure",
            "Observing",
            "Committing",
            "Checkpointing",
            "Closing",
            "Hydrating",
          ].includes(d.state._tag);
          expect(releaseOnAbort(d.state) !== undefined).toBe(holds);
        }
      }),
    );
  });

  it("rejects an event that does not fit the state, as a typed value", () => {
    const rejected = decide(initial, { _tag: "Committed", nowMs: 0 });
    expect("_tag" in rejected && rejected._tag).toBe("TransitionRejected");
  });
});
