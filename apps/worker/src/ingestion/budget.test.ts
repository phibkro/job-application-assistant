import { describe, expect, it } from "vitest";
import { decideAfterPage, decideContinuation, foldPage } from "./budget.ts";

const budget = { maxPages: 3, maxObservations: 100, maxDurationMs: 10_000 };

describe("decideContinuation", () => {
  it("continues while every bound is unmet", () => {
    expect(decideContinuation(budget, { pages: 0, observations: 0, elapsedMs: 0 })).toEqual({
      _tag: "Continue",
    });
  });

  it("stops on the page bound before the others, when it is hit first", () => {
    expect(decideContinuation(budget, { pages: 3, observations: 0, elapsedMs: 0 })).toEqual({
      _tag: "BudgetExhausted",
      boundary: "pages",
    });
  });

  it("stops on the observation bound", () => {
    expect(decideContinuation(budget, { pages: 0, observations: 100, elapsedMs: 0 })).toEqual({
      _tag: "BudgetExhausted",
      boundary: "observations",
    });
  });

  it("stops on the duration bound", () => {
    expect(decideContinuation(budget, { pages: 0, observations: 0, elapsedMs: 10_000 })).toEqual({
      _tag: "BudgetExhausted",
      boundary: "duration",
    });
  });

  it("a zero-page budget stops before any page is ever fetched", () => {
    const zero = { maxPages: 0, maxObservations: 100, maxDurationMs: 10_000 };
    expect(decideContinuation(zero, { pages: 0, observations: 0, elapsedMs: 0 })).toEqual({
      _tag: "BudgetExhausted",
      boundary: "pages",
    });
  });
});

describe("foldPage", () => {
  it("advances the cursor to the page's own cursor, and appends this page's external ids", () => {
    const before = { cursor: "start", seenExternalIds: ["a"] };
    const after = foldPage(before, {
      listings: [{ externalId: "b" }, { externalId: "c" }],
      cursor: "next",
    });
    expect(after).toEqual({ cursor: "next", seenExternalIds: ["a", "b", "c"] });
  });

  it("folding zero listings still advances the cursor — an all-filtered page is not a no-op", () => {
    const before = { cursor: "start", seenExternalIds: [] };
    const after = foldPage(before, { listings: [], cursor: "next" });
    expect(after).toEqual({ cursor: "next", seenExternalIds: [] });
  });

  it("two folds accumulate rather than replace — this is the whole sweep's memory, not just the latest page's", () => {
    const first = foldPage(
      { cursor: "a", seenExternalIds: [] },
      { listings: [{ externalId: "1" }], cursor: "b" },
    );
    const second = foldPage(first, { listings: [{ externalId: "2" }], cursor: "c" });
    expect(second.seenExternalIds).toEqual(["1", "2"]);
  });
});

describe("decideAfterPage — complete vs. partial, the invariant closeAbsent depends on", () => {
  it("more:false reaches the tail and carries every id seen this sweep, regardless of remaining budget", () => {
    // Budget is nowhere near exhausted, and the page still ends the sweep:
    // `more` alone decides this, not "did we run out of room."
    const outcome = decideAfterPage(
      budget,
      { pages: 1, observations: 1, elapsedMs: 0 },
      { more: false },
      ["1", "2"],
    );
    expect(outcome).toEqual({ _tag: "ReachedTail", seenExternalIds: ["1", "2"] });
  });

  it("more:true with budget remaining does not stop — the type has no field a caller could pass to closeAbsent yet", () => {
    const outcome = decideAfterPage(
      budget,
      { pages: 1, observations: 1, elapsedMs: 0 },
      { more: true },
      ["1"],
    );
    expect(outcome).toBeUndefined();
  });

  it("more:true but budget exhausted stops as BudgetExhausted, not ReachedTail — a partial walk has no seenExternalIds field to close with", () => {
    const outcome = decideAfterPage(
      budget,
      { pages: 3, observations: 1, elapsedMs: 0 },
      { more: true },
      ["1"],
    );
    expect(outcome).toEqual({ _tag: "BudgetExhausted", boundary: "pages" });
    expect(outcome && "seenExternalIds" in outcome).toBe(false);
  });

  it("reaching the tail on the exact page that also exhausts the budget still counts as complete — the source has nothing left either way", () => {
    const outcome = decideAfterPage(
      budget,
      { pages: 3, observations: 1, elapsedMs: 0 },
      { more: false },
      ["1"],
    );
    expect(outcome).toEqual({ _tag: "ReachedTail", seenExternalIds: ["1"] });
  });
});
