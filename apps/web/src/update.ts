import * as Match from "effect/Match";
import * as Option from "effect/Option";
import { AsyncData, Command } from "foldkit";
import type { Update } from "foldkit";
import { evo } from "foldkit/struct";
import * as Applications from "./Applications.ts";
import * as Commands from "./Commands.ts";
import { GotProfileMessage } from "./Message.ts";
import type { Message } from "./Message.ts";
import {
  ApplyStageDecided,
  ApplyStageDrafted,
  ApplyStagePrepared,
  ApplyStageSaved,
  type Model,
  PageBrowse,
  PageFeed,
  PageProfile,
  type Problem,
  RequestFailed,
  RequestIdle,
  RequestPending,
  SessionAnonymous,
  SessionAuthenticated,
  initialModel,
} from "./Model.ts";
import * as ProfileSubmodel from "./profile/index.ts";
import { settle } from "./Settle.ts";

export type UpdateReturn = Update.Return<Model, Message>;
const withReturnType = Match.withReturnType<UpdateReturn>();

/** Starts loading a cache field only if nothing has asked for it yet.
 *  Re-navigating to a page that already has data (or is already loading)
 *  does not refire the request. */
const ensureLoaded = <A>(
  current: AsyncData.AsyncData<A, Problem>,
  load: Update.Commands<Message>[number],
): readonly [AsyncData.AsyncData<A, Problem>, Update.Commands<Message>] =>
  AsyncData.isIdle(current) ? [AsyncData.Loading(), [load]] : [current, []];

export const update = (model: Model, message: Message): UpdateReturn =>
  Match.value(message).pipe(
    withReturnType,
    Match.tagsExhaustive({
      Navigated: ({ to }) => {
        const withPage = evo(model, { page: () => to });
        return Match.value(to).pipe(
          withReturnType,
          Match.tagsExhaustive({
            Browse: () => {
              const [browseResults, cmds] = ensureLoaded(
                withPage.browseResults,
                Commands.FetchJobs({ ...withPage.browseQuery, cursor: Option.none() }),
              );
              return [evo(withPage, { browseResults: () => browseResults }), cmds];
            },
            JobDetail: ({ jobId }) => [
              evo(withPage, { jobDetail: () => AsyncData.Loading() }),
              [Commands.FetchJob({ jobId })],
            ],
            Feed: () => {
              const [feedResults, cmds] = ensureLoaded(withPage.feedResults, Commands.FetchFeed());
              return [evo(withPage, { feedResults: () => feedResults }), cmds];
            },
            // Not `ensureLoaded`: that helper writes an `AsyncData` field
            // directly, but `profile` is a Submodel now, and the one
            // legitimate way to transition its Model is through its own
            // `update` — the `Requested` arm is where "start loading" is
            // actually defined, so this only decides *whether* to fire it.
            Profile: () => {
              if (!AsyncData.isIdle(withPage.profile.profile)) return [withPage, []];
              const [nextProfile, profileCommands] = ProfileSubmodel.update(
                withPage.profile,
                ProfileSubmodel.Requested(),
              );
              return [
                evo(withPage, { profile: () => nextProfile }),
                Command.mapMessages(profileCommands, (childMessage) =>
                  GotProfileMessage({ message: childMessage }),
                ),
              ];
            },
          }),
        );
      },

      // SESSION

      SessionTokenInputChanged: ({ value }) => [evo(model, { sessionTokenInput: () => value }), []],

      SessionTokenSubmitted: () => {
        const token = model.sessionTokenInput.trim();
        if (token === "") return [model, []];
        return [
          evo(model, { session: () => SessionAuthenticated({ token }) }),
          [Commands.PersistSessionToken({ token })],
        ];
      },

      // Signing out drops every cache that could hold the previous
      // identity's data — an Anonymous session showing someone else's
      // profile from cache is exactly the bad state this union should not
      // allow to linger. `profile` resets via the Submodel's own `init`,
      // not by reaching into its fields: the root has no business knowing
      // what "empty" looks like inside another Model's shape, only that
      // its own `init` is the definition of empty.
      SessionCleared: () => [
        evo(model, {
          session: () => SessionAnonymous(),
          sessionTokenInput: () => "",
          profile: () => ProfileSubmodel.init(),
          feedResults: () => AsyncData.Idle(),
          applications: () => [],
        }),
        [Commands.ClearSessionToken()],
      ],

      StorageSynced: () => [model, []],

      // BROWSE

      BrowseTermChanged: ({ value }) => [
        evo(model, { browseQuery: (q) => evo(q, { term: () => value }) }),
        [],
      ],
      BrowseLocationChanged: ({ value }) => [
        evo(model, { browseQuery: (q) => evo(q, { location: () => value }) }),
        [],
      ],
      BrowseStatusChanged: ({ value }) => [
        evo(model, { browseQuery: (q) => evo(q, { status: () => value }) }),
        [],
      ],

      BrowseSearchSubmitted: () => [
        evo(model, { browseResults: () => AsyncData.Loading() }),
        [Commands.FetchJobs({ ...model.browseQuery, cursor: Option.none() })],
      ],

      BrowseNextPageRequested: () => {
        const data = AsyncData.getData(model.browseResults);
        return Option.match(data, {
          onNone: () => [model, []] as UpdateReturn,
          onSome: (page) =>
            page.meta.nextCursor === null
              ? ([model, []] as UpdateReturn)
              : ([
                  evo(model, { browseResults: () => AsyncData.Refreshing({ data: page }) }),
                  [
                    Commands.FetchJobs({
                      ...model.browseQuery,
                      cursor: Option.some(page.meta.nextCursor),
                    }),
                  ],
                ] as UpdateReturn),
        });
      },

      BrowseJobsSucceeded: ({ page }) => [
        evo(model, { browseResults: () => AsyncData.Success({ data: page }) }),
        [],
      ],
      BrowseJobsFailed: ({ problem }) => [
        evo(model, { browseResults: (r) => settle(r, problem) }),
        [],
      ],

      // JOB DETAIL

      JobFetchSucceeded: ({ job }) => [
        evo(model, { jobDetail: () => AsyncData.Success({ data: job }) }),
        [],
      ],
      JobFetchFailed: ({ problem }) => [evo(model, { jobDetail: (r) => settle(r, problem) }), []],

      // FEED

      FeedRequested: () => [
        evo(model, { feedResults: () => AsyncData.Loading() }),
        [Commands.FetchFeed()],
      ],
      FeedSucceeded: ({ page }) => [
        evo(model, { feedResults: () => AsyncData.Success({ data: page }) }),
        [],
      ],
      FeedFailed: ({ problem }) => [evo(model, { feedResults: (r) => settle(r, problem) }), []],

      FeedDismissClicked: ({ jobId, verdict, reason }) => [
        model,
        [Commands.DismissFeedItem({ jobId, verdict, reason })],
      ],
      FeedDismissSucceeded: ({ jobId }) => [
        evo(model, {
          feedResults: (r) =>
            AsyncData.map(r, (page) => ({
              ...page,
              data: page.data.filter((job) => job.id !== jobId),
            })),
        }),
        [],
      ],
      // A failed dismiss leaves the listing exactly as it was — nothing to
      // roll back, because nothing optimistic was applied. The job simply
      // stays visible, which is the correct outcome to show.
      FeedDismissFailed: () => [model, []],

      // PROFILE — the entire cluster lives in the Submodel (see
      // `profile/`); the root only forwards the wrapped Message to its
      // `update` and lifts the Commands it hands back into its own
      // Message universe.
      GotProfileMessage: ({ message: profileMessage }) => {
        const [nextProfile, profileCommands] = ProfileSubmodel.update(
          model.profile,
          profileMessage,
        );
        return [
          evo(model, { profile: () => nextProfile }),
          Command.mapMessages(profileCommands, (childMessage) =>
            GotProfileMessage({ message: childMessage }),
          ),
        ];
      },

      // APPLY LOOP

      SaveJobClicked: ({ jobId }) => [
        evo(model, {
          applications: (records) =>
            Applications.upsert(records, jobId, (r) => evo(r, { pending: () => RequestPending() })),
        }),
        [Commands.SaveJob({ jobId, note: Option.none() })],
      ],
      SaveJobSucceeded: ({ jobId, savedJobId }) => [
        evo(model, {
          applications: (records) =>
            Applications.upsert(records, jobId, (r) =>
              evo(r, {
                stage: () => Option.some(ApplyStageSaved({ savedJobId, note: Option.none() })),
                pending: () => RequestIdle(),
              }),
            ),
        }),
        [],
      ],
      SaveJobFailed: ({ jobId, problem }) => [applyFailed(model, jobId, problem), []],

      DraftRequested: ({ jobId, savedJobId }) => [
        evo(model, {
          applications: (records) =>
            Applications.upsert(records, jobId, (r) => evo(r, { pending: () => RequestPending() })),
        }),
        [Commands.DraftApplication({ jobId, savedJobId })],
      ],
      DraftSucceeded: ({ jobId, savedJobId, cv, letter, generator }) => [
        evo(model, {
          applications: (records) =>
            Applications.upsert(records, jobId, (r) =>
              evo(r, {
                stage: () => Option.some(ApplyStageDrafted({ savedJobId, cv, letter, generator })),
                pending: () => RequestIdle(),
              }),
            ),
        }),
        [],
      ],
      DraftFailed: ({ jobId, problem }) => [applyFailed(model, jobId, problem), []],

      PrepareRequested: ({ jobId, savedJobId, method }) => [
        evo(model, {
          applications: (records) =>
            Applications.upsert(records, jobId, (r) => evo(r, { pending: () => RequestPending() })),
        }),
        [Commands.PrepareApplication({ jobId, savedJobId, method })],
      ],
      PrepareSucceeded: ({
        jobId,
        savedJobId,
        applicationId,
        method,
        applicationUrl,
        cv,
        letter,
        downgradeReason,
      }) => [
        evo(model, {
          applications: (records) =>
            Applications.upsert(records, jobId, (r) =>
              evo(r, {
                stage: () =>
                  Option.some(
                    ApplyStagePrepared({
                      savedJobId,
                      applicationId,
                      method,
                      applicationUrl,
                      cv,
                      letter,
                      downgradeReason,
                    }),
                  ),
                pending: () => RequestIdle(),
              }),
            ),
        }),
        [],
      ],
      PrepareFailed: ({ jobId, problem }) => [applyFailed(model, jobId, problem), []],

      DecisionRequested: ({ jobId, applicationId, decision }) => [
        evo(model, {
          applications: (records) =>
            Applications.upsert(records, jobId, (r) => evo(r, { pending: () => RequestPending() })),
        }),
        [Commands.DecideApplication({ jobId, applicationId, decision })],
      ],
      DecisionSucceeded: ({ jobId, applicationId, status }) => [
        evo(model, {
          applications: (records) =>
            Applications.upsert(records, jobId, (r) =>
              evo(r, {
                pending: () => RequestIdle(),
                stage: () =>
                  Option.match(r.stage, {
                    onNone: () => r.stage,
                    onSome: (stage) =>
                      stage._tag === "Prepared" || stage._tag === "Decided"
                        ? Option.some(
                            ApplyStageDecided({
                              savedJobId: stage.savedJobId,
                              applicationId,
                              method: stage.method,
                              applicationUrl: stage.applicationUrl,
                              cv: stage.cv,
                              letter: stage.letter,
                              downgradeReason: stage.downgradeReason,
                              status,
                            }),
                          )
                        : r.stage,
                  }),
              }),
            ),
        }),
        [],
      ],
      DecisionFailed: ({ jobId, problem }) => [applyFailed(model, jobId, problem), []],
    }),
  );

const applyFailed = (model: Model, jobId: string, problem: Problem): Model =>
  evo(model, {
    applications: (records) =>
      Applications.upsert(records, jobId, (r) =>
        evo(r, { pending: () => RequestFailed({ problem }) }),
      ),
  });

// Re-exported so `entry.ts` and tests share one definition of "the app's
// starting Model" without importing `Model.ts` twice under different names.
export { initialModel, PageBrowse, PageFeed, PageProfile };
