import { Schema } from "effect";
import { jobQuery, jobsQuery } from "./query.ts";
import { AppRoute } from "./route.ts";

export const Model = Schema.Struct({
  route: AppRoute,
  /** The filter form's draft text; the applied filter lives in the route. */
  termInput: Schema.String,
  locationInput: Schema.String,
  jobs: jobsQuery.Model,
  job: jobQuery.Model,
  /** The list query a detail page links back to. */
  lastJobsQuery: Schema.Struct({
    term: Schema.Option(Schema.String),
    location: Schema.Option(Schema.String),
  }),
});
export type Model = typeof Model.Type;
