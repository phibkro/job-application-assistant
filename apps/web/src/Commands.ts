import * as Effect from "effect/Effect";
import * as Match from "effect/Match";
import * as Option from "effect/Option";
import * as S from "effect/Schema";
import { Command, Http, Navigation } from "foldkit";
import { Profile } from "@job-index/domain/Profile";
import { makeClient } from "./Client.ts";
import { Decision } from "./Message.ts";
import * as Msg from "./Message.ts";
// `./profile/Message.ts` directly, not the `profile/` barrel: the barrel
// also re-exports `update.ts`, which imports this very module — going
// through it here would close a circular import. `Model.ts` has the same
// story with `profile/Model.ts` (see its own comment).
import * as ProfileMessage from "./profile/Message.ts";
import { NetworkError, Problem } from "./RequestStatus.ts";
import * as Session from "./Session.ts";

/**
 * All Command bodies funnel errors through here.
 *
 * `HttpApiClient` decodes a failed response into exactly the TaggedError the
 * endpoint declares (`Unauthorized`, `NotFound`, `UpgradeRequired`,
 * `ForbiddenByPlatform`), so checking the value against `Problem`'s own
 * schema is how a Command tells "the server declared this failure" apart
 * from a transport failure or a decode mismatch neither typed error
 * describes. Nothing here inspects a stack trace or forwards one to the
 * Model — a 402 is a value, not an exception, by the time a view sees it.
 */
const isKnownProblem = S.is(Problem);

const describeError = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "_tag" in error) {
    return String((error as { readonly _tag: unknown })._tag);
  }
  return "Request failed";
};

const toProblem = (error: unknown): Problem =>
  isKnownProblem(error) ? error : NetworkError({ detail: describeError(error) });

/** The session token is read fresh from `sessionStorage` inside every
 *  Command rather than threaded through Message args from the Model. That
 *  keeps one authoritative copy of the token (the storage itself); `Model.session`
 *  is a display-only mirror kept in step by `SessionTokenSubmitted` /
 *  `SessionCleared`, never the value a request actually authenticates with. */
const currentToken = (): Option.Option<string> => Option.fromNullOr(Session.readToken());

const withHttp = <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.provide(effect, Http.layer);

export const FetchJobs = Command.define("FetchJobs", {
  args: {
    term: S.String,
    location: S.String,
    status: S.String,
    cursor: S.OptionFromNullOr(S.String),
  },
  messages: [Msg.BrowseJobsSucceeded, Msg.BrowseJobsFailed],
  execute: ({ term, location, status, cursor }) =>
    withHttp(
      Effect.gen(function* () {
        const client = yield* makeClient(currentToken());
        const page = yield* client.corpus.listJobs({
          query: {
            term: term === "" ? undefined : term,
            location: location === "" ? undefined : location,
            status: status === "" ? undefined : status,
            cursor: Option.getOrUndefined(cursor),
          },
        });
        return Msg.BrowseJobsSucceeded({ page });
      }).pipe(
        Effect.catch((error) =>
          Effect.succeed(Msg.BrowseJobsFailed({ problem: toProblem(error) })),
        ),
      ),
    ),
});

export const FetchJob = Command.define("FetchJob", {
  args: { jobId: S.String },
  messages: [Msg.JobFetchSucceeded, Msg.JobFetchFailed],
  execute: ({ jobId }) =>
    withHttp(
      Effect.gen(function* () {
        const client = yield* makeClient(currentToken());
        const job = yield* client.corpus.getJob({ params: { id: jobId } });
        return Msg.JobFetchSucceeded({ job });
      }).pipe(
        Effect.catch((error) => Effect.succeed(Msg.JobFetchFailed({ problem: toProblem(error) }))),
      ),
    ),
});

/**
 * The hover-to-prefetch call: the same `getJob` endpoint `FetchJob` uses,
 * fired early so the worker hydrates the vacancy before a click, and
 * discarded either way — `PrefetchSettled` carries nothing back, on purpose
 * (see `Message.ts`'s `BrowseJobPressed`). A failure here (the source is
 * down, the id is stale) is not this person's problem: `JobDetail`'s own
 * route re-fetches on open regardless and shows its own error if that one
 * fails.
 */
export const PrefetchJob = Command.define("PrefetchJob", {
  args: { jobId: S.String },
  messages: [Msg.PrefetchSettled],
  execute: ({ jobId }) =>
    withHttp(
      Effect.gen(function* () {
        const client = yield* makeClient(currentToken());
        yield* client.corpus.getJob({ params: { id: jobId } });
        return Msg.PrefetchSettled();
      }).pipe(Effect.catch(() => Effect.succeed(Msg.PrefetchSettled()))),
    ),
});

export const FetchFeed = Command.define("FetchFeed", {
  messages: [Msg.FeedSucceeded, Msg.FeedFailed],
  execute: withHttp(
    Effect.gen(function* () {
      const client = yield* makeClient(currentToken());
      const page = yield* client.feed.fresh({ query: {} });
      return Msg.FeedSucceeded({ page });
    }).pipe(Effect.catch((error) => Effect.succeed(Msg.FeedFailed({ problem: toProblem(error) })))),
  ),
});

export const DismissFeedItem = Command.define("DismissFeedItem", {
  args: { jobId: S.String, verdict: S.String, reason: S.OptionFromNullOr(S.String) },
  messages: [Msg.FeedDismissSucceeded, Msg.FeedDismissFailed],
  execute: ({ jobId, verdict, reason }) =>
    withHttp(
      Effect.gen(function* () {
        const client = yield* makeClient(currentToken());
        yield* client.feed.dismiss({
          params: { id: jobId },
          payload: { verdict, reason: Option.getOrUndefined(reason) },
        });
        return Msg.FeedDismissSucceeded({ jobId });
      }).pipe(
        Effect.catch((error) =>
          Effect.succeed(Msg.FeedDismissFailed({ jobId, problem: toProblem(error) })),
        ),
      ),
    ),
});

export const FetchProfile = Command.define("FetchProfile", {
  messages: [ProfileMessage.FetchSucceeded, ProfileMessage.FetchFailed],
  execute: withHttp(
    Effect.gen(function* () {
      const client = yield* makeClient(currentToken());
      const response = yield* client.profile.me();
      return ProfileMessage.FetchSucceeded({ response });
    }).pipe(
      Effect.catch((error) =>
        Effect.succeed(ProfileMessage.FetchFailed({ problem: toProblem(error) })),
      ),
    ),
  ),
});

export const SaveProfile = Command.define("SaveProfile", {
  // `capabilities` travels through as the value already sitting in the
  // Model (from the last `/me`), not a second fetch: `setProfile` cannot
  // change what an account is entitled to, so there is nothing new to ask
  // the server for.
  args: { profile: Profile, capabilities: S.Array(S.String) },
  messages: [ProfileMessage.SaveSucceeded, ProfileMessage.SaveFailed],
  execute: ({ profile, capabilities }) =>
    withHttp(
      Effect.gen(function* () {
        const client = yield* makeClient(currentToken());
        const saved = yield* client.profile.setProfile({ payload: profile });
        return ProfileMessage.SaveSucceeded({ response: { profile: saved, capabilities } });
      }).pipe(
        Effect.catch((error) =>
          Effect.succeed(ProfileMessage.SaveFailed({ problem: toProblem(error) })),
        ),
      ),
    ),
});

export const SaveJob = Command.define("SaveJob", {
  args: { jobId: S.String, note: S.OptionFromNullOr(S.String) },
  messages: [Msg.SaveJobSucceeded, Msg.SaveJobFailed],
  execute: ({ jobId, note }) =>
    withHttp(
      Effect.gen(function* () {
        const client = yield* makeClient(currentToken());
        const result = yield* client.applications.save({
          payload: { jobId, note: Option.getOrUndefined(note) },
        });
        return Msg.SaveJobSucceeded({ jobId, savedJobId: result.savedJobId });
      }).pipe(
        Effect.catch((error) =>
          Effect.succeed(Msg.SaveJobFailed({ jobId, problem: toProblem(error) })),
        ),
      ),
    ),
});

export const DraftApplication = Command.define("DraftApplication", {
  args: { jobId: S.String, savedJobId: S.String },
  messages: [Msg.DraftSucceeded, Msg.DraftFailed],
  execute: ({ jobId, savedJobId }) =>
    withHttp(
      Effect.gen(function* () {
        const client = yield* makeClient(currentToken());
        const result = yield* client.applications.draft({
          params: { id: savedJobId },
          payload: {},
        });
        return Msg.DraftSucceeded({ jobId, savedJobId, ...result });
      }).pipe(
        Effect.catch((error) =>
          Effect.succeed(Msg.DraftFailed({ jobId, problem: toProblem(error) })),
        ),
      ),
    ),
});

export const PrepareApplication = Command.define("PrepareApplication", {
  args: { jobId: S.String, savedJobId: S.String, method: S.OptionFromNullOr(S.String) },
  messages: [Msg.PrepareSucceeded, Msg.PrepareFailed],
  execute: ({ jobId, savedJobId, method }) =>
    withHttp(
      Effect.gen(function* () {
        const client = yield* makeClient(currentToken());
        const result = yield* client.applications.prepare({
          params: { id: savedJobId },
          payload: { method: Option.getOrUndefined(method) },
        });
        return Msg.PrepareSucceeded({ jobId, savedJobId, ...result });
      }).pipe(
        Effect.catch((error) =>
          Effect.succeed(Msg.PrepareFailed({ jobId, problem: toProblem(error) })),
        ),
      ),
    ),
});

/** Maps the closed `Decision` tag to the wire string only here, at the
 *  Command boundary — the one place that must speak the server's untyped
 *  `decision` field. `Match.exhaustive` makes an unhandled `Decision` a
 *  compile error: adding a fourth verdict without a branch here fails
 *  `bun run typecheck`, not a review that has to remember to check it. */
const decisionToWire = (decision: Decision): string =>
  Match.value(decision).pipe(
    Match.withReturnType<string>(),
    Match.when("Approve", () => "approve"),
    Match.when("Rework", () => "rework"),
    Match.when("Decline", () => "decline"),
    Match.exhaustive,
  );

export const DecideApplication = Command.define("DecideApplication", {
  args: { jobId: S.String, applicationId: S.String, decision: Decision },
  messages: [Msg.DecisionSucceeded, Msg.DecisionFailed],
  execute: ({ jobId, applicationId, decision }) =>
    withHttp(
      Effect.gen(function* () {
        const client = yield* makeClient(currentToken());
        const result = yield* client.applications.decide({
          params: { id: applicationId },
          payload: { decision: decisionToWire(decision) },
        });
        return Msg.DecisionSucceeded({ jobId, applicationId, status: result.status });
      }).pipe(
        Effect.catch((error) =>
          Effect.succeed(Msg.DecisionFailed({ jobId, problem: toProblem(error) })),
        ),
      ),
    ),
});

/** Pushing (rather than replacing) is always correct here: every call site
 *  is a real navigation the person should be able to back out of — a link
 *  click or a submitted search — never a same-screen correction. */
export const PushUrl = Command.define("PushUrl", {
  args: { href: S.String },
  messages: [Msg.UrlPushed],
  execute: ({ href }) => Navigation.pushUrl(href).pipe(Effect.as(Msg.UrlPushed())),
});

/** For a `UrlRequest.External`: a full page navigation, so `UrlPushed`
 *  never actually reaches `update` before the page unloads. Still needs a
 *  result Message to satisfy the Command contract. */
export const LoadUrl = Command.define("LoadUrl", {
  args: { href: S.String },
  messages: [Msg.UrlPushed],
  execute: ({ href }) => Navigation.load(href).pipe(Effect.as(Msg.UrlPushed())),
});

export const PersistSessionToken = Command.define("PersistSessionToken", {
  args: { token: S.String },
  messages: [Msg.StorageSynced],
  execute: ({ token }) =>
    Effect.sync(() => {
      Session.writeToken(token);
      return Msg.StorageSynced();
    }),
});

export const ClearSessionToken = Command.define("ClearSessionToken", {
  messages: [Msg.StorageSynced],
  execute: Effect.sync(() => {
    Session.clearToken();
    return Msg.StorageSynced();
  }),
});
