import type { Update } from "foldkit";
import { UrlRequest } from "foldkit/navigation";
import { modifyFields } from "foldkit/struct";
import { toString as urlToString } from "foldkit/url";
import { LoadExternal, NavigateInternal } from "./command.ts";
import * as Filters from "./domain/filters.ts";
import { Message } from "./message.ts";
import type { Model } from "./model.ts";
import { jobQuery, jobsQuery } from "./query.ts";
import { AppRoute, type JobsQuery, jobsRouter, urlToAppRoute } from "./route.ts";

type UpdateReturn = Update.Return<Model, Message>;

const jobs = jobsQuery.lift<Model, Message>({
  parentField: "jobs",
  toParentMessage: (message) => Message.GotJobsMessage({ message }),
});

const job = jobQuery.lift<Model, Message>({
  parentField: "job",
  toParentMessage: (message) => Message.GotJobMessage({ message }),
});

/** What the current route needs on screen, fetched only when the cache lacks it. */
export const loadRoute = (model: Model): UpdateReturn =>
  AppRoute.match<UpdateReturn>(model.route, {
    Jobs: ({ term, location }) => jobs.loadIfMissing(model, { term, location }),
    Job: ({ jobId }) => job.loadIfMissing(model, { jobId }),
    NotFound: () => ({ model }),
  });

/**
 * Entering a route. A list route also resets the filter form to the applied
 * filter, so back/forward and shared links never show a form that disagrees
 * with the results under it.
 */
export const enterRoute = (model: Model, route: AppRoute): UpdateReturn =>
  loadRoute(
    AppRoute.matchOrElse<Model>(
      route,
      {
        Jobs: ({ term, location }) =>
          modifyFields(model, {
            route: () => route,
            termInput: () => Filters.termInput({ term, location }),
            locationInput: () => Filters.locationInput({ term, location }),
            lastJobsQuery: () => ({ term, location }),
          }),
      },
      () => modifyFields(model, { route: () => route }),
    ),
  );

const navigateToJobs = (model: Model, query: JobsQuery): UpdateReturn => ({
  model,
  commands: [NavigateInternal({ url: jobsRouter(query) })],
});

export const update = (model: Model, message: Message) =>
  Message.match<UpdateReturn>(message, {
    CompletedNavigateInternal: () => ({ model }),
    CompletedLoadExternal: () => ({ model }),

    ClickedLink: ({ request }) =>
      UrlRequest.match<UpdateReturn>(request, {
        Internal: ({ url }) => ({
          model,
          commands: [NavigateInternal({ url: urlToString(url) })],
        }),
        External: ({ href }) => ({ model, commands: [LoadExternal({ href })] }),
      }),

    ChangedUrl: ({ url }) => enterRoute(model, urlToAppRoute(url)),

    UpdatedTermInput: ({ value }) => ({
      model: modifyFields(model, { termInput: () => value }),
    }),
    UpdatedLocationInput: ({ value }) => ({
      model: modifyFields(model, { locationInput: () => value }),
    }),

    SubmittedFilters: () =>
      navigateToJobs(model, Filters.fromInputs(model.termInput, model.locationInput)),
    ClickedClearFilters: () => navigateToJobs(model, Filters.empty),

    ClickedRetryJobs: () =>
      AppRoute.matchOrElse<UpdateReturn>(
        model.route,
        { Jobs: ({ term, location }) => jobs.revalidateOrLoad(model, { term, location }) },
        () => ({ model }),
      ),
    ClickedRetryJob: ({ jobId }) => job.revalidateOrLoad(model, { jobId }),

    GotJobsMessage: ({ message: jobsMessage }) => jobs.fold(model, jobsMessage),
    GotJobMessage: ({ message: jobMessage }) => job.fold(model, jobMessage),
  });
