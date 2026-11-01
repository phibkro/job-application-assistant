import { Effect, Schema } from "effect";
import { Http } from "foldkit";
import { Query } from "foldkit/experimental";
import { CanonicalJob } from "@job-index/domain/Job";
import { JobPage } from "@job-index/worker/Api";
import { getJob, listCurrentJobs } from "./api.ts";

/**
 * The read cache. One keyed Query per endpoint: the list is keyed by the
 * filter state, the detail by job id (api-cache-query example). Route entry
 * uses `loadIfMissing`, so a revisited query or vacancy renders from the Model
 * and is NOT revalidated within a tab session: data loaded once stays until a
 * reload, or until a failed load is retried.
 */
export const jobsQuery = Query.define({
  name: "Jobs",
  args: {
    term: Schema.Option(Schema.String),
    location: Schema.Option(Schema.String),
  },
  data: JobPage,
  error: Schema.String,
  execute: (query) => listCurrentJobs(query).pipe(Effect.provide(Http.layer)),
});

export const jobQuery = Query.define({
  name: "Job",
  args: { jobId: Schema.String },
  data: CanonicalJob,
  error: Schema.String,
  execute: ({ jobId }) => getJob(jobId).pipe(Effect.provide(Http.layer)),
});
