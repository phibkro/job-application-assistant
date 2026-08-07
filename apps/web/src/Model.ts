import * as Option from "effect/Option";
import * as S from "effect/Schema";
import { AsyncData } from "foldkit";
import { ts } from "foldkit/schema";
import { CanonicalJob } from "@job-index/domain/Job";
import { Profile } from "@job-index/domain/Profile";
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
// Re-exported so callers (including tests) construct a `Problem` member
// through `Model.ts` — the one place that assembles the union — instead of
// reaching past it to the worker contract directly.
export { ForbiddenByPlatform, NotFound, UpgradeRequired, Unauthorized };

/**
 * A page of jobs, as `corpus.listJobs` and `feed.fresh` both return it.
 *
 * `Api.ts` builds this shape (`JobPage`) inline and does not export it, so a
 * Model field of this type has nothing to import — this is the one
 * unavoidable restatement in this module, and it restates only the
 * pagination envelope, not `CanonicalJob` itself.
 */
const PageMeta = S.Struct({ limit: S.Number, nextCursor: S.NullOr(S.String) });
export const JobPage = S.Struct({ data: S.Array(CanonicalJob), meta: PageMeta });
export type JobPage = typeof JobPage.Type;

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

// PAGE — which screen is showing. Not URL-backed: this slot builds the loop,
// not a router, so navigation is Model state like any other.
export const PageBrowse = ts("Browse", {});
export const PageJobDetail = ts("JobDetail", { jobId: S.String });
export const PageFeed = ts("Feed", {});
export const PageProfile = ts("Profile", {});
export const Page = S.Union([PageBrowse, PageJobDetail, PageFeed, PageProfile]);
export type Page = typeof Page.Type;

// SESSION
export const SessionAnonymous = ts("Anonymous", {});
export const SessionAuthenticated = ts("Authenticated", { token: S.String });
export const SessionState = S.Union([SessionAnonymous, SessionAuthenticated]);
export type SessionState = typeof SessionState.Type;

export const BrowseQuery = S.Struct({ term: S.String, location: S.String, status: S.String });
export type BrowseQuery = typeof BrowseQuery.Type;

export const BrowseAsyncData = AsyncData.Schema(JobPage, Problem);
export const JobDetailAsyncData = AsyncData.Schema(CanonicalJob, Problem);
export const FeedAsyncData = AsyncData.Schema(JobPage, Problem);

export const MeResponse = S.Struct({ profile: Profile, capabilities: S.Array(S.String) });
export type MeResponse = typeof MeResponse.Type;
export const ProfileAsyncData = AsyncData.Schema(MeResponse, Problem);

/** The edit buffer for the profile form. A separate copy from the fetched
 *  `MeResponse` so typing does not retroactively change what "saved" means;
 *  `ProfileSaveClicked` is what commits it. */
export const ProfileForm = S.Struct({
  headline: S.String,
  summary: S.String,
  location: S.String,
  languages: S.String,
  /** Newline-separated in the form, split into `Profile.skills` on save. */
  skillsText: S.String,
  /** Newline-separated in the form, split into `Profile.education` on save. */
  educationText: S.String,
  experience: S.Array(
    S.Struct({
      title: S.String,
      employer: S.String,
      period: S.String,
      /** Newline-separated in the form, split into `highlights` on save. */
      highlightsText: S.String,
    }),
  ),
});
export type ProfileForm = typeof ProfileForm.Type;
export type ExperienceForm = ProfileForm["experience"][number];

// REQUEST STATUS — tri-state for a single in-flight action: nothing
// meaningful to hold on success because success is already reflected by
// `ApplyStage` advancing.
export const RequestIdle = ts("Idle", {});
export const RequestPending = ts("Pending", {});
export const RequestFailed = ts("Failed", { problem: Problem });
export const RequestStatus = S.Union([RequestIdle, RequestPending, RequestFailed]);
export type RequestStatus = typeof RequestStatus.Type;

/**
 * Where one job's application stands. Each stage carries forward what a
 * later stage needs — `Prepared` still has `cv`/`letter` so `decide` can
 * render what was actually sent — so "decide before prepare" is a state this
 * union cannot represent rather than a check `update` has to remember to run.
 */
export const ApplyStageSaved = ts("Saved", {
  savedJobId: S.String,
  note: S.OptionFromNullOr(S.String),
});
export const ApplyStageDrafted = ts("Drafted", {
  savedJobId: S.String,
  cv: S.String,
  letter: S.String,
  generator: S.String,
});
export const ApplyStagePrepared = ts("Prepared", {
  savedJobId: S.String,
  applicationId: S.String,
  method: S.String,
  applicationUrl: S.String,
  cv: S.String,
  letter: S.String,
  downgradeReason: S.NullOr(S.String),
});
export const ApplyStageDecided = ts("Decided", {
  savedJobId: S.String,
  applicationId: S.String,
  method: S.String,
  applicationUrl: S.String,
  cv: S.String,
  letter: S.String,
  downgradeReason: S.NullOr(S.String),
  status: S.String,
});
export const ApplyStage = S.Union([
  ApplyStageSaved,
  ApplyStageDrafted,
  ApplyStagePrepared,
  ApplyStageDecided,
]);
export type ApplyStage = typeof ApplyStage.Type;

export const ApplyRecord = S.Struct({
  jobId: S.String,
  stage: S.Option(ApplyStage),
  pending: RequestStatus,
});
export type ApplyRecord = typeof ApplyRecord.Type;

export const Model = S.Struct({
  page: Page,
  session: SessionState,
  sessionTokenInput: S.String,

  browseQuery: BrowseQuery,
  browseResults: BrowseAsyncData.schema,

  jobDetail: JobDetailAsyncData.schema,

  feedResults: FeedAsyncData.schema,

  profile: ProfileAsyncData.schema,
  profileForm: S.Option(ProfileForm),
  profileSaving: RequestStatus,

  applications: S.Array(ApplyRecord),
});
export type Model = typeof Model.Type;

export const initialModel: Model = {
  page: PageBrowse(),
  session: SessionAnonymous(),
  sessionTokenInput: "",

  browseQuery: { term: "", location: "", status: "" },
  browseResults: BrowseAsyncData.Idle(),

  jobDetail: JobDetailAsyncData.Idle(),

  feedResults: FeedAsyncData.Idle(),

  profile: ProfileAsyncData.Idle(),
  profileForm: Option.none(),
  profileSaving: RequestIdle(),

  applications: [],
};
