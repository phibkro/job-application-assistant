import * as S from "effect/Schema";
import { m } from "foldkit/message";
import { CanonicalJob } from "@job-index/domain/Job";
import { JobPage, Page, Problem } from "./Model.ts";
import * as ProfileMessage from "./profile/Message.ts";

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

// Navigation
export const Navigated = m("Navigated", { to: Page });

// Session
export const SessionTokenInputChanged = m("SessionTokenInputChanged", { value: S.String });
export const SessionTokenSubmitted = m("SessionTokenSubmitted");
export const SessionCleared = m("SessionCleared");
/** The sole completion Message for `PersistSessionToken` and
 *  `ClearSessionToken`: both write to `sessionStorage`, a Command effect
 *  that must still resolve to some Message, but neither has anything left
 *  to tell the Model — `SessionTokenSubmitted` / `SessionCleared` already
 *  applied the visible change before the Command ran. `update` treats this
 *  as a no-op. */
export const StorageSynced = m("StorageSynced");

// Browse
export const BrowseTermChanged = m("BrowseTermChanged", { value: S.String });
export const BrowseLocationChanged = m("BrowseLocationChanged", { value: S.String });
export const BrowseStatusChanged = m("BrowseStatusChanged", { value: S.String });
export const BrowseSearchSubmitted = m("BrowseSearchSubmitted");
export const BrowseNextPageRequested = m("BrowseNextPageRequested");
export const BrowseJobsSucceeded = m("BrowseJobsSucceeded", { page: JobPage });
export const BrowseJobsFailed = m("BrowseJobsFailed", { problem: Problem });

// Job detail
export const JobFetchSucceeded = m("JobFetchSucceeded", { job: CanonicalJob });
export const JobFetchFailed = m("JobFetchFailed", { problem: Problem });

// Feed
export const FeedRequested = m("FeedRequested");
export const FeedSucceeded = m("FeedSucceeded", { page: JobPage });
export const FeedFailed = m("FeedFailed", { problem: Problem });
export const FeedDismissClicked = m("FeedDismissClicked", {
  jobId: S.String,
  verdict: S.String,
  reason: S.OptionFromNullOr(S.String),
});
export const FeedDismissSucceeded = m("FeedDismissSucceeded", { jobId: S.String });
export const FeedDismissFailed = m("FeedDismissFailed", { jobId: S.String, problem: Problem });

// Profile — the entire cluster (was 18 tags: field edits, experience-entry
// edits, and the fetch/save request lifecycle) lives behind the profile
// Submodel now (see `profile/`). The root only forwards to it.
export const GotProfileMessage = m("GotProfileMessage", { message: ProfileMessage.Message });

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
  Navigated,
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
  JobFetchSucceeded,
  JobFetchFailed,
  FeedRequested,
  FeedSucceeded,
  FeedFailed,
  FeedDismissClicked,
  FeedDismissSucceeded,
  FeedDismissFailed,
  GotProfileMessage,
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
