import { Schema } from "effect";
import { defineMessageUnion } from "foldkit/message";
import { UrlRequest } from "foldkit/navigation";
import { Url } from "foldkit/url";
import { jobQuery, jobsQuery } from "./query.ts";

export const Message = defineMessageUnion({
  CompletedNavigateInternal: {},
  CompletedLoadExternal: {},
  ClickedLink: { request: UrlRequest },
  ChangedUrl: { url: Url },
  UpdatedTermInput: { value: Schema.String },
  UpdatedLocationInput: { value: Schema.String },
  SubmittedFilters: {},
  ClickedClearFilters: {},
  ClickedRetryJobs: {},
  ClickedRetryJob: { jobId: Schema.String },
  GotJobsMessage: { message: jobsQuery.Message },
  GotJobMessage: { message: jobQuery.Message },
});
export type Message = typeof Message.Type;
