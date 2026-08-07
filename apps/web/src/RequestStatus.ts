import * as S from "effect/Schema";
import { ts } from "foldkit/schema";
// Reused rather than restated: these are the same TaggedError classes the
// worker's contract declares for `feed`, `profile`, and `applications`. A
// premium refusal or an unauthorized call decodes into the exact schema the
// server encoded it with, so there is one definition of what those failures
// look like, not a client-side guess that can drift from the server's.
import {
  ForbiddenByPlatform,
  NotFound,
  UpgradeRequired,
  Unauthorized,
} from "../../worker/src/Api.ts";
// Re-exported so callers construct a `Problem` member through this module
// — the one place that assembles the union — instead of reaching past it
// to the worker contract directly.
export { ForbiddenByPlatform, NotFound, UpgradeRequired, Unauthorized };

/** A failure this app knows how to explain. `NetworkError` is the one member
 *  the wire contract does not declare: it covers a transport failure or a
 *  response that failed to decode, neither of which is a typed API error. */
export const NetworkError = ts("NetworkError", { detail: S.String });
export const Problem = S.Union([
  Unauthorized,
  NotFound,
  UpgradeRequired,
  ForbiddenByPlatform,
  NetworkError,
]);
export type Problem = typeof Problem.Type;

/**
 * A cluster's own leaf module rather than a field on `Model.ts`: `Problem`
 * and `RequestStatus` are shared by every cluster's cache/request state —
 * root and every Submodel alike — so this has to sit below all of them.
 * Defining it inside `Model.ts` would make `Model.ts` the root's own file,
 * and a Submodel's `Model.ts` importing from the root's `Model.ts` for a
 * concept this generic is exactly the kind of edge that turns into a
 * circular import the moment the root also needs something back from the
 * Submodel (which `Model.ts` does, for its `profile` field).
 */

// REQUEST STATUS — tri-state for a single in-flight action: nothing
// meaningful to hold on success because success is already reflected by
// the cache field (or `ApplyStage`) advancing.
export const RequestIdle = ts("Idle", {});
export const RequestPending = ts("Pending", {});
export const RequestFailed = ts("Failed", { problem: Problem });
export const RequestStatus = S.Union([RequestIdle, RequestPending, RequestFailed]);
export type RequestStatus = typeof RequestStatus.Type;
