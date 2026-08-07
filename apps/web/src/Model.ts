import * as S from "effect/Schema";
import { AsyncData } from "foldkit";
import { ts } from "foldkit/schema";
import { CanonicalJob } from "@job-index/domain/Job";
import * as ProfileSubmodel from "./profile/Model.ts";
// `Problem` and the request tri-state live below every cluster (see
// `RequestStatus.ts`'s own docstring for why); re-exported from here too so
// every existing call site that reached them through `Model.ts` keeps
// working unchanged.
import {
  ForbiddenByPlatform,
  NetworkError,
  NotFound,
  Problem,
  RequestFailed,
  RequestIdle,
  RequestPending,
  RequestStatus,
  UpgradeRequired,
  Unauthorized,
} from "./RequestStatus.ts";
export {
  ForbiddenByPlatform,
  NetworkError,
  NotFound,
  Problem,
  RequestFailed,
  RequestIdle,
  RequestPending,
  RequestStatus,
  UpgradeRequired,
  Unauthorized,
};

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

// PAGE — which screen is showing. URL-backed: `Route.ts` parses the
// address bar into a `Route` and `update.ts`'s `UrlChanged` handler is the
// only place that turns one into a `Page`, so this field is always in step
// with the last URL the runtime saw, never a second copy of it.
export const PageBrowse = ts("Browse", {});
export const PageJobDetail = ts("JobDetail", { jobId: S.String });
export const PageFeed = ts("Feed", {});
export const PageProfile = ts("Profile", {});
// Not named `NotFound` — that tag is already `RequestStatus.ts`'s Problem
// variant, re-exported from this module; a second binding of the same name
// would collide at the import site even though the two unions never mix.
export const PageNotFound = ts("NotFound", { path: S.String });
export const Page = S.Union([PageBrowse, PageJobDetail, PageFeed, PageProfile, PageNotFound]);
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

  profile: ProfileSubmodel.Model,

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

  profile: ProfileSubmodel.init(),

  applications: [],
};
