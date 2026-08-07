import * as Match from "effect/Match";
import * as Option from "effect/Option";
import { AsyncData } from "foldkit";
import type { Update } from "foldkit";
import { evo } from "foldkit/struct";
import * as Applications from "./Applications.ts";
import * as Commands from "./Commands.ts";
import type { Message } from "./Message.ts";
import {
  ApplyStageDecided,
  ApplyStageDrafted,
  ApplyStagePrepared,
  ApplyStageSaved,
  type ExperienceForm,
  type Model,
  PageBrowse,
  PageFeed,
  PageProfile,
  type ProfileForm,
  type Problem,
  RequestFailed,
  RequestIdle,
  RequestPending,
  SessionAnonymous,
  SessionAuthenticated,
  initialModel,
} from "./Model.ts";
import * as ProfileFormCodec from "./ProfileFormCodec.ts";

export type UpdateReturn = Update.Return<Model, Message>;
const withReturnType = Match.withReturnType<UpdateReturn>();

/** After a request that was already showing data fails, keep the data on
 *  screen (`Stale`) instead of replacing it with a bare error — the same
 *  stale-while-revalidate shape `AsyncData` was built for, applied on the
 *  failure side. A first-ever failure (`Idle`/`Loading`) has no data to
 *  keep, so it becomes a plain `Failure`. */
const settle = <A>(
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
            Profile: () => {
              const [profile, cmds] = ensureLoaded(withPage.profile, Commands.FetchProfile());
              return [evo(withPage, { profile: () => profile }), cmds];
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
      // allow to linger.
      SessionCleared: () => [
        evo(model, {
          session: () => SessionAnonymous(),
          sessionTokenInput: () => "",
          profile: () => AsyncData.Idle(),
          profileForm: () => Option.none(),
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

      // PROFILE

      ProfileRequested: () => [
        evo(model, { profile: () => AsyncData.Loading() }),
        [Commands.FetchProfile()],
      ],

      ProfileFetchSucceeded: ({ response }) => [
        evo(model, {
          profile: () => AsyncData.Success({ data: response }),
          profileForm: () => Option.some(ProfileFormCodec.fromProfile(response.profile)),
        }),
        [],
      ],
      ProfileFetchFailed: ({ problem }) => [evo(model, { profile: (r) => settle(r, problem) }), []],

      ProfileHeadlineChanged: ({ value }) => [
        editProfileForm(model, (f) => evo(f, { headline: () => value })),
        [],
      ],
      ProfileSummaryChanged: ({ value }) => [
        editProfileForm(model, (f) => evo(f, { summary: () => value })),
        [],
      ],
      ProfileLocationChanged: ({ value }) => [
        editProfileForm(model, (f) => evo(f, { location: () => value })),
        [],
      ],
      ProfileLanguagesChanged: ({ value }) => [
        editProfileForm(model, (f) => evo(f, { languages: () => value })),
        [],
      ],
      ProfileSkillsTextChanged: ({ value }) => [
        editProfileForm(model, (f) => evo(f, { skillsText: () => value })),
        [],
      ],
      ProfileEducationTextChanged: ({ value }) => [
        editProfileForm(model, (f) => evo(f, { educationText: () => value })),
        [],
      ],

      ProfileExperienceAdded: () => [
        editProfileForm(model, (f) =>
          evo(f, { experience: (xs) => [...xs, ProfileFormCodec.emptyExperience] }),
        ),
        [],
      ],
      ProfileExperienceRemoved: ({ index }) => [
        editProfileForm(model, (f) =>
          evo(f, { experience: (xs) => xs.filter((_, i) => i !== index) }),
        ),
        [],
      ],
      ProfileExperienceTitleChanged: ({ index, value }) => [
        editExperience(model, index, (entry) => evo(entry, { title: () => value })),
        [],
      ],
      ProfileExperienceEmployerChanged: ({ index, value }) => [
        editExperience(model, index, (entry) => evo(entry, { employer: () => value })),
        [],
      ],
      ProfileExperiencePeriodChanged: ({ index, value }) => [
        editExperience(model, index, (entry) => evo(entry, { period: () => value })),
        [],
      ],
      ProfileExperienceHighlightsTextChanged: ({ index, value }) => [
        editExperience(model, index, (entry) => evo(entry, { highlightsText: () => value })),
        [],
      ],

      ProfileSaveClicked: () =>
        Option.match(model.profileForm, {
          onNone: () => [model, []] as UpdateReturn,
          onSome: (form) =>
            [
              evo(model, { profileSaving: () => RequestPending() }),
              [
                Commands.SaveProfile({
                  profile: ProfileFormCodec.toProfile(form),
                  capabilities: Option.match(AsyncData.getData(model.profile), {
                    onNone: () => [],
                    onSome: (response) => response.capabilities,
                  }),
                }),
              ],
            ] as UpdateReturn,
        }),
      ProfileSaveSucceeded: ({ response }) => [
        evo(model, {
          profile: () => AsyncData.Success({ data: response }),
          profileForm: () => Option.some(ProfileFormCodec.fromProfile(response.profile)),
          profileSaving: () => RequestIdle(),
        }),
        [],
      ],
      ProfileSaveFailed: ({ problem }) => [
        evo(model, { profileSaving: () => RequestFailed({ problem }) }),
        [],
      ],

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

const editProfileForm = (model: Model, transform: (form: ProfileForm) => ProfileForm): Model =>
  evo(model, { profileForm: (form) => Option.map(form, transform) });

const editExperience = (
  model: Model,
  index: number,
  transform: (entry: ExperienceForm) => ExperienceForm,
): Model =>
  editProfileForm(model, (form) =>
    evo(form, {
      experience: (xs) => xs.map((entry, i) => (i === index ? transform(entry) : entry)),
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
