import { AsyncData } from "foldkit";
import type { Problem } from "./RequestStatus.ts";

/** After a request that was already showing data fails, keep the data on
 *  screen (`Stale`) instead of replacing it with a bare error — the same
 *  stale-while-revalidate shape `AsyncData` was built for, applied on the
 *  failure side. A first-ever failure (`Idle`/`Loading`) has no data to
 *  keep, so it becomes a plain `Failure`.
 *
 *  Shared by the root `update` and every submodel's `update` so "what a
 *  failed request does to a cache field" has one definition, not one per
 *  cluster — living here rather than inside `update.ts` is what lets a
 *  submodel import it without importing the root `update` module back. */
export const settle = <A>(
  current: AsyncData.AsyncData<A, Problem>,
  error: Problem,
): AsyncData.AsyncData<A, Problem> =>
  AsyncData.match(current, {
    onIdle: () => AsyncData.Failure({ error }),
    onLoading: () => AsyncData.Failure({ error }),
    onRefreshing: (data) => AsyncData.Stale({ error, data }),
    onFailure: () => AsyncData.Failure({ error }),
    onStale: ({ data }) => AsyncData.Stale({ error, data }),
    onSuccess: (data) => AsyncData.Stale({ error, data }),
  });
