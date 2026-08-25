import * as Effect from "effect/Effect";
import * as Match from "effect/Match";
import * as Option from "effect/Option";
import * as S from "effect/Schema";
import { Command, Http, Navigation } from "foldkit";
import * as Dom from "foldkit/dom";
import * as FoldkitFile from "foldkit/file";
import { Profile } from "@job-index/domain/Profile";
import { ApplicationEvent, SavedSort, SavedView } from "../../worker/src/Api.ts";
import { CustomLabelId } from "@job-index/domain/Ids";
import { makeClient } from "./Client.ts";
import { Decision } from "./Message.ts";
import { ThemePreferenceSchema, persistThemePreference } from "./theme.ts";
import * as Msg from "./Message.ts";
import * as ProfileMessage from "./profile/Message.ts";
// `./profile/Message.ts` directly, not the `profile/` barrel: the barrel
// also re-exports `update.ts`, which imports this very module — going
// through it here would close a circular import. `Model.ts` has the same
// story with `profile/Model.ts` (see its own comment).
import { NetworkError, Problem } from "./RequestStatus.ts";
import * as SavedMessage from "./saved/Message.ts";
import {
  CustomLabel as SavedCustomLabel,
  CustomLabelsResponse as SavedCustomLabelsResponse,
} from "./saved/Model.ts";
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

export const FetchPublicJob = Command.define("FetchPublicJob", {
  args: { jobId: S.String },
  messages: [Msg.PublicJobFetchSucceeded, Msg.JobFetchFailed],
  execute: ({ jobId }) =>
    withHttp(
      Effect.gen(function* () {
        const client = yield* makeClient(Option.none());
        const job = yield* client.corpus.getJob({ params: { id: jobId } });
        return Msg.PublicJobFetchSucceeded({ job });
      }).pipe(
        Effect.catch((error) => Effect.succeed(Msg.JobFetchFailed({ problem: toProblem(error) }))),
      ),
    ),
});

export const FetchMatchDetail = Command.define("FetchMatchDetail", {
  args: { jobId: S.String },
  messages: [Msg.MatchDetailFetchSucceeded, Msg.JobFetchFailed],
  execute: ({ jobId }) =>
    withHttp(
      Effect.gen(function* () {
        const client = yield* makeClient(currentToken());
        const matchedJob = yield* client.feed.getMatch({ params: { id: jobId } });
        return Msg.MatchDetailFetchSucceeded({ matchedJob });
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
  // Model (from the last `/me`), not a second fetch. The nullable revision is
  // the optimistic-concurrency token for a profile that may not exist yet.
  // Generation and base revision return with either completion so update can
  // reject a response whose request no longer owns the save slot.
  args: {
    profile: Profile,
    capabilities: S.Array(S.String),
    expectedUpdatedAt: S.NullOr(S.String),
    generation: S.Number,
  },
  messages: [ProfileMessage.SaveSucceeded, ProfileMessage.SaveFailed],
  execute: ({ profile, capabilities, expectedUpdatedAt, generation }) =>
    withHttp(
      Effect.gen(function* () {
        const client = yield* makeClient(currentToken());
        const saved = yield* client.profile.setProfile({
          payload: { profile, expectedUpdatedAt },
        });
        return ProfileMessage.SaveSucceeded({
          response: { ...saved, capabilities },
          generation,
          baseProfileUpdatedAt: expectedUpdatedAt,
        });
      }).pipe(
        Effect.catch((error) =>
          Effect.succeed(
            ProfileMessage.SaveFailed({
              generation,
              baseProfileUpdatedAt: expectedUpdatedAt,
              problem: toProblem(error),
            }),
          ),
        ),
      ),
    ),
});

export const FetchSaved = Command.define("FetchSaved", {
  args: {
    view: SavedView,
    label: S.OptionFromNullOr(CustomLabelId),
    sort: SavedSort,
    cursor: S.OptionFromNullOr(S.String),
    append: S.Boolean,
  },
  messages: [SavedMessage.FetchSucceeded, SavedMessage.FetchFailed],
  execute: ({ view, label, sort, cursor, append }) =>
    withHttp(
      Effect.gen(function* () {
        const client = yield* makeClient(currentToken());
        const page = yield* client.applications.listSaved({
          query: {
            view,
            label: Option.getOrUndefined(label),
            sort,
            cursor: Option.getOrUndefined(cursor),
          },
        });
        return SavedMessage.FetchSucceeded({ page, append });
      }).pipe(
        Effect.catch((error) =>
          Effect.succeed(SavedMessage.FetchFailed({ problem: toProblem(error), append })),
        ),
      ),
    ),
});

export const FetchSavedApplicationHistory = Command.define("FetchSavedApplicationHistory", {
  args: { savedJobId: S.String },
  messages: [SavedMessage.ApplicationHistorySucceeded, SavedMessage.ApplicationHistoryFailed],
  execute: ({ savedJobId }) =>
    withHttp(
      Effect.gen(function* () {
        const client = yield* makeClient(currentToken());
        const response = yield* client.applications.listSavedApplicationHistory({
          params: { id: savedJobId },
        });
        return SavedMessage.ApplicationHistorySucceeded({ savedJobId, response });
      }).pipe(
        Effect.catch((error) =>
          Effect.succeed(
            SavedMessage.ApplicationHistoryFailed({
              savedJobId,
              problem: toProblem(error),
            }),
          ),
        ),
      ),
    ),
});

export const FetchSavedLabels = Command.define("FetchSavedLabels", {
  messages: [SavedMessage.LabelsFetchSucceeded, SavedMessage.LabelsFetchFailed],
  execute: withHttp(
    Effect.gen(function* () {
      const client = yield* makeClient(currentToken());
      const response = yield* client.applications.listSavedLabels();
      const labels = yield* S.decodeUnknownEffect(SavedCustomLabelsResponse)(response);
      return SavedMessage.LabelsFetchSucceeded({ response: labels });
    }).pipe(
      Effect.catch((error) =>
        Effect.succeed(SavedMessage.LabelsFetchFailed({ problem: toProblem(error) })),
      ),
    ),
  ),
});

export const CreateSavedLabel = Command.define("CreateSavedLabel", {
  args: { name: S.String },
  messages: [SavedMessage.LabelCreated, SavedMessage.CreateLabelFailed],
  execute: ({ name }) =>
    withHttp(
      Effect.gen(function* () {
        const client = yield* makeClient(currentToken());
        const response = yield* client.applications.createSavedLabel({ payload: { name } });
        const label = yield* S.decodeUnknownEffect(SavedCustomLabel)(response);
        return SavedMessage.LabelCreated({ label });
      }).pipe(
        Effect.catch((error) =>
          Effect.succeed(SavedMessage.CreateLabelFailed({ problem: toProblem(error) })),
        ),
      ),
    ),
});

export const RenameSavedLabel = Command.define("RenameSavedLabel", {
  args: { labelId: CustomLabelId, name: S.String },
  messages: [SavedMessage.LabelRenamed, SavedMessage.RenameLabelFailed],
  execute: ({ labelId, name }) =>
    withHttp(
      Effect.gen(function* () {
        const client = yield* makeClient(currentToken());
        const response = yield* client.applications.renameSavedLabel({
          params: { id: labelId },
          payload: { name },
        });
        const label = yield* S.decodeUnknownEffect(SavedCustomLabel)(response);
        return SavedMessage.LabelRenamed({ label });
      }).pipe(
        Effect.catch((error) =>
          Effect.succeed(
            SavedMessage.RenameLabelFailed({
              labelId,
              problem: toProblem(error),
            }),
          ),
        ),
      ),
    ),
});

export const DeleteSavedLabel = Command.define("DeleteSavedLabel", {
  args: { labelId: CustomLabelId },
  messages: [SavedMessage.LabelDeleted, SavedMessage.DeleteLabelFailed],
  execute: ({ labelId }) =>
    withHttp(
      Effect.gen(function* () {
        const client = yield* makeClient(currentToken());
        yield* client.applications.deleteSavedLabel({ params: { id: labelId } });
        return SavedMessage.LabelDeleted({ labelId });
      }).pipe(
        Effect.catch((error) =>
          Effect.succeed(
            SavedMessage.DeleteLabelFailed({
              labelId,
              problem: toProblem(error),
            }),
          ),
        ),
      ),
    ),
});

export const SetSavedLabels = Command.define("SetSavedLabels", {
  args: { savedJobId: S.String, labelIds: S.Array(CustomLabelId) },
  messages: [SavedMessage.LabelAssignmentSucceeded, SavedMessage.LabelAssignmentFailed],
  execute: ({ savedJobId, labelIds }) =>
    withHttp(
      Effect.gen(function* () {
        const client = yield* makeClient(currentToken());
        yield* client.applications.setSavedLabels({
          params: { id: savedJobId },
          payload: { labelIds },
        });
        return SavedMessage.LabelAssignmentSucceeded({ savedJobId, labelIds });
      }).pipe(
        Effect.catch((error) =>
          Effect.succeed(
            SavedMessage.LabelAssignmentFailed({
              savedJobId,
              problem: toProblem(error),
            }),
          ),
        ),
      ),
    ),
});

export const AddApplicationEvent = Command.define("AddApplicationEvent", {
  args: {
    savedJobId: S.String,
    applicationId: S.String,
    event: ApplicationEvent,
    expectedUpdatedAt: S.String,
  },
  messages: [SavedMessage.ApplicationEventSucceeded, SavedMessage.ApplicationEventFailed],
  execute: ({ savedJobId, applicationId, event, expectedUpdatedAt }) =>
    withHttp(
      Effect.gen(function* () {
        const client = yield* makeClient(currentToken());
        const response = yield* client.applications.addApplicationEvent({
          params: { id: applicationId },
          payload: { event, expectedUpdatedAt },
        });
        return SavedMessage.ApplicationEventSucceeded({ savedJobId, response });
      }).pipe(
        Effect.catch((error) =>
          Effect.succeed(
            SavedMessage.ApplicationEventFailed({
              savedJobId,
              problem: toProblem(error),
            }),
          ),
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
  args: { token: S.String, sessionEpoch: S.Number },
  messages: [Msg.StorageSynced],
  execute: ({ token, sessionEpoch }) =>
    Effect.sync(() => {
      Session.writeToken(token);
      return Msg.StorageSynced({ sessionEpoch });
    }),
});

export const ClearSessionToken = Command.define("ClearSessionToken", {
  args: { sessionEpoch: S.Number },
  messages: [Msg.StorageSynced],
  execute: ({ sessionEpoch }) =>
    Effect.sync(() => {
      Session.clearToken();
      return Msg.StorageSynced({ sessionEpoch });
    }),
});

// ---- Appearance (WS-0013-r1) --------------------------------------------
// The same shape as `PersistSessionToken`: a synchronous local write whose
// completion exists only so the update loop stays total. The write itself
// (`persistThemePreference`) validates, applies to the document root
// immediately — which is what the user sees — and lands the JSON in
// localStorage under `job-index-theme-v1`.

export const PersistThemePreference = Command.define("PersistThemePreference", {
  args: { preference: ThemePreferenceSchema },
  messages: [ProfileMessage.ThemePersisted],
  execute: ({ preference }) =>
    Effect.sync(() => {
      persistThemePreference(preference);
      return ProfileMessage.ThemePersisted();
    }),
});

// --- WS-0016: document→profile proposal import ------------------------------

export const MAX_PDF_PROFILE_FILE_BYTES = 512 * 1024;
export const MAX_TEXT_PROFILE_FILE_BYTES = 800_000;
export const MAX_TEXT_PROFILE_CHARACTERS = 200_000;

export type ProfileFileIo = Readonly<{
  name: (file: FoldkitFile.File) => string;
  mimeType: (file: FoldkitFile.File) => string;
  size: (file: FoldkitFile.File) => number;
  readAsDataUrl: (file: FoldkitFile.File) => Effect.Effect<string, FoldkitFile.FileReadError>;
  readAsText: (file: FoldkitFile.File) => Effect.Effect<string, FoldkitFile.FileReadError>;
}>;

const liveProfileFileIo: ProfileFileIo = {
  name: FoldkitFile.name,
  mimeType: FoldkitFile.mimeType,
  size: FoldkitFile.size,
  readAsDataUrl: FoldkitFile.readAsDataUrl,
  readAsText: FoldkitFile.readAsText,
};

/**
 * Classifies the native file and bounds allocation before invoking either
 * FileReader operation. PDF retains its 512 KiB raw-byte boundary. Plain text
 * permits the maximum four-byte UTF-8 representation, then enforces the
 * worker contract's 200,000-character limit after decoding.
 */
export const readProfileFile = (file: FoldkitFile.File, io: ProfileFileIo = liveProfileFileIo) =>
  Effect.gen(function* () {
    const name = io.name(file).toLowerCase();
    const declaredType = io.mimeType(file);
    const isPdf = declaredType === "application/pdf" || name.endsWith(".pdf");
    const isText = declaredType === "text/plain" || name.endsWith(".txt");
    if (!isPdf && !isText) {
      return yield* Effect.fail(NetworkError({ detail: "Select a PDF or plain-text document." }));
    }
    const byteLimit = isPdf ? MAX_PDF_PROFILE_FILE_BYTES : MAX_TEXT_PROFILE_FILE_BYTES;
    if (io.size(file) > byteLimit) {
      return yield* Effect.fail(
        NetworkError({
          detail: isPdf
            ? "PDF files must be 512 KiB or smaller."
            : "Plain-text files must be 800,000 bytes or smaller.",
        }),
      );
    }
    const content = isPdf
      ? yield* Effect.map(io.readAsDataUrl(file), (dataUrl) => {
          const separator = dataUrl.indexOf(",");
          return separator < 0 ? "" : dataUrl.slice(separator + 1);
        })
      : yield* io.readAsText(file);
    if (isText && content.length > MAX_TEXT_PROFILE_CHARACTERS) {
      return yield* Effect.fail(
        NetworkError({ detail: "Plain-text files must be 200,000 characters or fewer." }),
      );
    }
    return {
      content,
      mimeType: isPdf ? ("application/pdf" as const) : ("text/plain" as const),
    };
  });

/** Reads a file chosen by the Profile page's native file input, then imports it. */
export const ImportProfileFile = Command.define("ImportProfileFile", {
  args: { file: FoldkitFile.File, generation: S.Number },
  messages: [ProfileMessage.ImportSucceeded, ProfileMessage.ImportFailed],
  execute: ({ file, generation }) =>
    withHttp(
      Effect.gen(function* () {
        const document = yield* readProfileFile(file);
        const client = yield* makeClient(currentToken());
        const response = yield* client.proposals.create({ payload: document });
        return ProfileMessage.ImportSucceeded({
          generation,
          mimeType: document.mimeType,
          response,
        });
      }).pipe(
        Effect.catch((error) =>
          Effect.succeed(ProfileMessage.ImportFailed({ generation, problem: toProblem(error) })),
        ),
      ),
    ),
});

/** Paste/upload a past document; the worker proposes facts, transiently. */
export const ImportProfileDocument = Command.define("ImportProfileDocument", {
  args: {
    content: S.String,
    mimeType: S.Literals(["text/plain", "application/pdf"]),
    generation: S.Number,
  },
  messages: [ProfileMessage.ImportSucceeded, ProfileMessage.ImportFailed],
  execute: ({ content, mimeType, generation }) =>
    withHttp(
      Effect.gen(function* () {
        const client = yield* makeClient(currentToken());
        const response = yield* client.proposals.create({
          payload: { content, mimeType },
        });
        return ProfileMessage.ImportSucceeded({ generation, mimeType, response });
      }).pipe(
        Effect.catch((error) =>
          Effect.succeed(ProfileMessage.ImportFailed({ generation, problem: toProblem(error) })),
        ),
      ),
    ),
});

export const FetchProposals = Command.define("FetchProposals", {
  args: { generation: S.Number },
  messages: [ProfileMessage.ProposalsFetchSucceeded, ProfileMessage.ProposalsFetchFailed],
  execute: ({ generation }) =>
    withHttp(
      Effect.gen(function* () {
        const client = yield* makeClient(currentToken());
        const response = yield* client.proposals.list();
        return ProfileMessage.ProposalsFetchSucceeded({ generation, response });
      }).pipe(
        Effect.catch((error) =>
          Effect.succeed(
            ProfileMessage.ProposalsFetchFailed({ generation, problem: toProblem(error) }),
          ),
        ),
      ),
    ),
});

/** Accept (optionally editing the value first) or discard one proposal. */
export const DecideProposal = Command.define("DecideProposal", {
  args: {
    proposalId: S.String,
    decision: S.Literals(["accepted", "discarded"]),
    value: S.OptionFromNullOr(S.String),
    valueKind: S.Literals(["scalar", "structured"]),
    generation: S.Number,
  },
  messages: [ProfileMessage.ProposalDecisionSucceeded, ProfileMessage.ProposalDecisionFailed],
  execute: ({ proposalId, decision, value, valueKind, generation }) =>
    withHttp(
      Effect.gen(function* () {
        const client = yield* makeClient(currentToken());
        const encodedValue = Option.map(value, (edited) =>
          valueKind === "scalar" ? (JSON.stringify(edited) ?? '""') : edited,
        );
        const payload: { decision: "accepted" | "discarded"; value?: string } = Option.isSome(
          encodedValue,
        )
          ? { decision, value: encodedValue.value }
          : { decision };
        const response = yield* client.proposals.decide({
          params: { id: proposalId },
          payload,
        });
        return ProfileMessage.ProposalDecisionSucceeded({
          id: proposalId,
          generation,
          response,
        });
      }).pipe(
        Effect.catch((error) =>
          Effect.succeed(
            ProfileMessage.ProposalDecisionFailed({
              id: proposalId,
              generation,
              problem: toProblem(error),
            }),
          ),
        ),
      ),
    ),
});

/** Moves review focus after a successful card removal, after render commits. */
export const FocusProposalReview = Command.define("FocusProposalReview", {
  args: { selector: S.String },
  messages: [ProfileMessage.ProposalFocusSettled],
  execute: ({ selector }) =>
    Effect.gen(function* () {
      yield* Dom.focus(selector, { makeFocusable: true });
      return ProfileMessage.ProposalFocusSettled();
    }).pipe(Effect.catch(() => Effect.succeed(ProfileMessage.ProposalFocusSettled()))),
});
