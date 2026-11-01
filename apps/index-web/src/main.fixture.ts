import type { Result } from "effect";
import { Option, Schema } from "effect";
import { CanonicalJob } from "@job-index/domain/Job";
import type { JobPage } from "@job-index/worker/Api";
import { fromString } from "foldkit/url";
import { modifyFields } from "foldkit/struct";
import { init, jobQuery, jobsQuery } from "./main.ts";
import type { Model } from "./model.ts";

const decodeJob = Schema.decodeUnknownSync(CanonicalJob);

export const bakerJob = decodeJob({
  id: "cj_1",
  title: "Baker i Østfold",
  employerName: "Bakeriet AS",
  location: "Østfold",
  applicationUrl: "https://example.com/job/1",
  publishedAt: "2026-08-01T06:00:00Z",
  status: { _tag: "Active" },
  sequence: 1,
  changedAt: "2026-08-01T06:00:00Z",
  sources: ["nav"],
  hydration: { _tag: "Hydrated", description: "Vi søker en baker." },
});

export const developerJob = decodeJob({
  id: "cj_2",
  title: "Frontendutvikler",
  employerName: "Nordic Tech AS",
  location: "Oslo",
  applicationUrl: "https://example.com/job/2",
  publishedAt: "2026-08-02T08:00:00Z",
  status: { _tag: "Active" },
  sequence: 2,
  changedAt: "2026-08-02T08:00:00Z",
  sources: ["nav"],
  hydration: { _tag: "Hydrated", description: "TypeScript og React.", deadline: "2026-09-01" },
});

export const pageOf = (data: JobPage["data"]): JobPage => ({
  data,
  meta: { limit: 50, nextCursor: null },
});

export const urlOrThrow = (raw: string) =>
  Option.getOrThrowWith(fromString(raw), () => new Error(`not a URL: ${raw}`));

/** The application exactly as it boots on a URL, before any fetch resolves. */
export const bootedAt = (raw: string): Model => init(urlOrThrow(raw)).model;

/** A model on a route that loads nothing, for stories that then visit a URL. */
export const blankModel: Model = bootedAt("http://localhost/__blank");

export const noFilter = { term: Option.none(), location: Option.none() };

type ListArgs = { readonly term: Option.Option<string>; readonly location: Option.Option<string> };

/**
 * A list fetch in flight on `model`, completed with `result`: the fact is
 * applied through the Query's own `update`, as the api-cache-query fixture does.
 */
export const withList = (
  model: Model,
  args: ListArgs,
  result: Result.Result<JobPage, string>,
): Model =>
  modifyFields(model, {
    jobs: (jobs) =>
      jobsQuery.update(
        jobs,
        jobsQuery.Message.CompletedFetch({ args, generation: jobs.generation, result }),
      ).model,
  });

/** The same for a vacancy fetch. */
export const withJob = (
  model: Model,
  jobId: string,
  result: Result.Result<CanonicalJob, string>,
): Model =>
  modifyFields(model, {
    job: (job) =>
      jobQuery.update(
        job,
        jobQuery.Message.CompletedFetch({ args: { jobId }, generation: job.generation, result }),
      ).model,
  });
