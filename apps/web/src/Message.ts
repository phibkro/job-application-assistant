import * as S from "effect/Schema";
import { Navigation } from "foldkit";
import { m } from "foldkit/message";
import { CanonicalJob } from "@job-index/domain/Job";
import { MatchedJob } from "../../worker/src/Api.ts";
import { JobPageSchema, MatchPageSchema, Problem } from "./Model.ts";
import * as ProfileMessage from "./profile/Message.ts";
import * as SavedMessage from "./saved/Message.ts";
import { Route } from "./Route.ts";

/**
 * The application's Message union.
 *
 * `Decision` mirrors `applications.decide`'s payload (`approve · rework ·
 * decline`) as a closed set of tags rather than the free string the wire
 * payload carries, so `update`'s match on it is exhaustive at compile time —
 * an unhandled case is a type error, not a runtime gap. It is narrowed back
 * to the wire string only at the Command boundary that encodes the request.
 */
export const Decision = S.Literals(["Approve", "Rework", "Decline"]);
export type Decision = typeof Decision.Type;

// Navigation — the runtime's own URL-request/URL-change split (see
// `Runtime.RoutingConfig`). `UrlRequested` fires for a click the runtime
// intercepted (an in-app `<a>`, same-origin or not) and only ever decides
// *whether* to push a new URL or leave the site; `UrlChanged` fires once
// the address bar has actually changed — by that push, by the back/forward
// buttons, or by a cold load — and is the one place a `Route` becomes the
// Model's `page`. Nothing dispatches a page change directly.
export const UrlRequested = m("UrlRequested", { request: Navigation.UrlRequest });
export const UrlChanged = m("UrlChanged", { route: Route });
/** The sole completion Message for `PushUrl`/`LoadUrl`: both leave the
 *  visible change already applied (the browser's own history/location APIs
 *  did it synchronously), so there is nothing left for `update` to do. */
export const UrlPushed = m("UrlPushed");

// Session
export const SessionTokenInputChanged = m("SessionTokenInputChanged", { value: S.String });
export const SessionTokenSubmitted = m("SessionTokenSubmitted");
export const SessionCleared = m("SessionCleared");
/** Completion for `PersistSessionToken` and `ClearSessionToken`. The epoch
 *  identifies the session transition that scheduled the storage write, so a
 *  late completion from an earlier owner cannot start the current owner's
 *  Saved load. */
export const StorageSynced = m("StorageSynced", { sessionEpoch: S.Number });

// Browse
export const BrowseTermChanged = m("BrowseTermChanged", { value: S.String });
export const BrowseLocationChanged = m("BrowseLocationChanged", { value: S.String });
export const BrowseStatusChanged = m("BrowseStatusChanged", { value: S.String });
export const BrowseSearchSubmitted = m("BrowseSearchSubmitted");
export const BrowseNextPageRequested = m("BrowseNextPageRequested");
export const BrowseJobsSucceeded = m("BrowseJobsSucceeded", { page: JobPageSchema });
export const BrowseJobsFailed = m("BrowseJobsFailed", { problem: Problem });
/**
 * A press, which is a decision — see `design-specs/deferred-hydration.md`.
 * Hover was the obvious signal and the wrong one: a pointer crossing a list
 * of eighty results would hydrate most of them and mean almost none of it,
 * while a press that never becomes a click is rare. The gap between press and
 * release is the latency this hides.
 *
 * Fires `PrefetchJob`, whose result never
 * reaches the Model (see `PrefetchSettled`): the point is asking the worker
 * to hydrate the vacancy server-side before a click, not caching anything
 * here — `JobDetail`'s own route always re-fetches on open regardless.
 */
export const BrowseJobPressed = m("BrowseJobPressed", { jobId: S.String });

// Job detail
export const PublicJobFetchSucceeded = m("PublicJobFetchSucceeded", { job: CanonicalJob });
export const MatchDetailFetchSucceeded = m("MatchDetailFetchSucceeded", { matchedJob: MatchedJob });
export const JobFetchFailed = m("JobFetchFailed", { problem: Problem });
/** `PrefetchJob`'s sole completion Message, win or lose — see `BrowseJobPressed`. */
export const PrefetchSettled = m("PrefetchSettled");

// Feed
export const FeedRequested = m("FeedRequested");
export const FeedSucceeded = m("FeedSucceeded", { page: MatchPageSchema });
export const FeedFailed = m("FeedFailed", { problem: Problem });
export const FeedDismissClicked = m("FeedDismissClicked", {
  jobId: S.String,
  verdict: S.Literals(["dismissed", "not_now", "irrelevant"]),
  reason: S.OptionFromNullOr(S.String),
});
export const FeedDismissSucceeded = m("FeedDismissSucceeded", { jobId: S.String });
export const FeedDismissFailed = m("FeedDismissFailed", { jobId: S.String, problem: Problem });

// Profile — the entire cluster (was 18 tags: field edits, experience-entry
// edits, and the fetch/save request lifecycle) lives behind the profile
// Submodel now (see `profile/`). The root only forwards to it.
export const GotProfileMessage = m("GotProfileMessage", {
  sessionEpoch: S.Number,
  message: ProfileMessage.Message,
});
export const GotSavedMessage = m("GotSavedMessage", {
  sessionEpoch: S.Number,
  message: SavedMessage.Message,
});

// Apply loop
export const SaveJobClicked = m("SaveJobClicked", { jobId: S.String });
export const SaveJobSucceeded = m("SaveJobSucceeded", { jobId: S.String, savedJobId: S.String });
export const SaveJobFailed = m("SaveJobFailed", { jobId: S.String, problem: Problem });

export const DraftRequested = m("DraftRequested", { jobId: S.String, savedJobId: S.String });
export const DraftSucceeded = m("DraftSucceeded", {
  jobId: S.String,
  savedJobId: S.String,
  cv: S.String,
  letter: S.String,
  generator: S.String,
});
export const DraftFailed = m("DraftFailed", { jobId: S.String, problem: Problem });

export const PrepareRequested = m("PrepareRequested", {
  jobId: S.String,
  savedJobId: S.String,
  method: S.OptionFromNullOr(S.String),
});
export const PrepareSucceeded = m("PrepareSucceeded", {
  jobId: S.String,
  savedJobId: S.String,
  applicationId: S.String,
  method: S.String,
  applicationUrl: S.String,
  cv: S.String,
  letter: S.String,
  downgradeReason: S.NullOr(S.String),
});
export const PrepareFailed = m("PrepareFailed", { jobId: S.String, problem: Problem });

export const DecisionRequested = m("DecisionRequested", {
  jobId: S.String,
  applicationId: S.String,
  decision: Decision,
});
export const DecisionSucceeded = m("DecisionSucceeded", {
  jobId: S.String,
  applicationId: S.String,
  status: S.String,
});
export const DecisionFailed = m("DecisionFailed", { jobId: S.String, problem: Problem });

export const Message = S.Union([
  UrlRequested,
  UrlChanged,
  UrlPushed,
  SessionTokenInputChanged,
  SessionTokenSubmitted,
  SessionCleared,
  StorageSynced,
  BrowseTermChanged,
  BrowseLocationChanged,
  BrowseStatusChanged,
  BrowseSearchSubmitted,
  BrowseNextPageRequested,
  BrowseJobsSucceeded,
  BrowseJobsFailed,
  BrowseJobPressed,
  PublicJobFetchSucceeded,
  MatchDetailFetchSucceeded,
  JobFetchFailed,
  PrefetchSettled,
  FeedRequested,
  FeedSucceeded,
  FeedFailed,
  FeedDismissClicked,
  FeedDismissSucceeded,
  FeedDismissFailed,
  GotProfileMessage,
  GotSavedMessage,
  SaveJobClicked,
  SaveJobSucceeded,
  SaveJobFailed,
  DraftRequested,
  DraftSucceeded,
  DraftFailed,
  PrepareRequested,
  PrepareSucceeded,
  PrepareFailed,
  DecisionRequested,
  DecisionSucceeded,
  DecisionFailed,
]);
export type Message = typeof Message.Type;
