import { Schema, pipe } from "effect";
import { Route } from "foldkit";
import { defineRouteUnion, literal, slash, string } from "foldkit/route";

/**
 * Every page the client renders. `Jobs` carries the whole filter state, so
 * the URL is the single source of truth for what the list shows: a shared
 * link or a back/forward step restores the same query.
 */
export const AppRoute = defineRouteUnion({
  Jobs: {
    term: Schema.Option(Schema.String),
    location: Schema.Option(Schema.String),
  },
  Job: { jobId: Schema.String },
  NotFound: { path: Schema.String },
});
export type AppRoute = typeof AppRoute.Type;
export type JobsRoute = typeof AppRoute.Jobs.Type;

/** The filter state as it travels in the URL: the `Jobs` route without its tag. */
export type JobsQuery = Omit<JobsRoute, "_tag">;

export const jobsRouter = pipe(
  Route.root,
  Route.query(
    Schema.Struct({
      term: Schema.OptionFromOptional(Schema.String),
      location: Schema.OptionFromOptional(Schema.String),
    }),
  ),
  Route.mapTo(AppRoute.Jobs),
);

export const jobRouter = pipe(literal("jobs"), slash(string("jobId")), Route.mapTo(AppRoute.Job));

const routeParser = Route.oneOf(jobRouter, jobsRouter);

export const urlToAppRoute = Route.parseUrlWithFallback(routeParser, AppRoute.NotFound);
