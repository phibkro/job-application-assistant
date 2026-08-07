/**
 * The pure heart of `collect`: given a budget and how far a walk has gone,
 * decide whether to fetch another page, and given one page's own `more`
 * flag, decide what kind of stop this is. Nothing here touches
 * `Acquisition`, `Corpus`, a clock, or a database — the properties
 * `collect.ts` composes around (budget exhaustion is checked *before* a page
 * is fetched, never after; a page only ever advances the walk once it has
 * fully folded; only a walk that observed the tail may close anything) are
 * provable with plain objects, the same reason `corpus/decide.ts` exists as
 * its own file.
 */

export interface RunBudgetLike {
  readonly maxPages: number;
  readonly maxObservations: number;
  readonly maxDurationMs: number;
}

export interface Progress {
  readonly pages: number;
  readonly observations: number;
  readonly elapsedMs: number;
}

export type Continuation =
  | { readonly _tag: "Continue" }
  | { readonly _tag: "BudgetExhausted"; readonly boundary: "pages" | "observations" | "duration" };

/**
 * Whether the walk may fetch another page. Checked before every fetch, never
 * after: a page not yet begun costs nothing to abandon, which is what keeps
 * "checkpoint whole pages only" true without needing to discard partial work.
 */
export const decideContinuation = (budget: RunBudgetLike, progress: Progress): Continuation => {
  if (progress.pages >= budget.maxPages) {
    return { _tag: "BudgetExhausted", boundary: "pages" };
  }
  if (progress.observations >= budget.maxObservations) {
    return { _tag: "BudgetExhausted", boundary: "observations" };
  }
  if (progress.elapsedMs >= budget.maxDurationMs) {
    return { _tag: "BudgetExhausted", boundary: "duration" };
  }
  return { _tag: "Continue" };
};

export interface WalkState {
  readonly cursor: string;
  readonly seenExternalIds: ReadonlyArray<string>;
}

/**
 * Folds one fetched page into the walk's running state. This is the cursor's
 * *only* advance point: it does not run until every listing on the page has
 * already been folded into the corpus, so a crash between two calls to this
 * function re-reads the page that was in flight rather than skipping it.
 */
export const foldPage = (
  state: WalkState,
  page: {
    readonly listings: ReadonlyArray<{ readonly externalId: string }>;
    readonly cursor: string;
  },
): WalkState => ({
  cursor: page.cursor,
  seenExternalIds: [
    ...state.seenExternalIds,
    ...page.listings.map((listing) => listing.externalId),
  ],
});

/**
 * What a walk decided, structurally. Only `ReachedTail` carries the
 * accumulated seen-id list `Corpus.closeAbsent` needs — there is no
 * `seenExternalIds` field on `BudgetExhausted` or `Failed` to read, so a call
 * site cannot reach `closeAbsent` from either of them. This is `collect`'s
 * own version of the shape `corpus/decide.ts`'s `absentOccurrences` already
 * uses for "a caller can enumerate what it found and cannot enumerate what
 * it did not": a partial walk has nowhere to put a seen-id list, by
 * construction, not by a check someone remembered to add at the call site.
 */
export type SweepOutcome =
  | { readonly _tag: "ReachedTail"; readonly seenExternalIds: ReadonlyArray<string> }
  | { readonly _tag: "BudgetExhausted"; readonly boundary: "pages" | "observations" | "duration" }
  | { readonly _tag: "Failed"; readonly failureTag: string; readonly detail: string };

/**
 * The decision made once per fetched page: did this page reach the tail, or
 * is there budget left to fetch another. `more:false` is the only fact that
 * can produce `ReachedTail` — deliberately not "the page was short" or "nothing
 * failed" — because either of those would let a source that merely returns
 * few results per page pass for "the whole thing", which is exactly the
 * false positive `closeAbsent`'s own contract forbids.
 */
export const decideAfterPage = (
  budget: RunBudgetLike,
  progress: Progress,
  page: { readonly more: boolean },
  seenExternalIds: ReadonlyArray<string>,
): SweepOutcome | undefined => {
  if (!page.more) {
    return { _tag: "ReachedTail", seenExternalIds };
  }
  const continuation = decideContinuation(budget, progress);
  return continuation._tag === "Continue" ? undefined : continuation;
};
