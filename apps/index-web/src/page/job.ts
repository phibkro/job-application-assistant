import { Array, Match } from "effect";
import { AsyncData } from "foldkit";
import type { Html, HtmlBuilder } from "foldkit/html";
import type { CanonicalJob } from "@job-index/domain/Job";
import { Message } from "../message.ts";
import type { Model } from "../model.ts";
import { jobQuery } from "../query.ts";
import { jobsRouter } from "../route.ts";
import { errorView, loadingView } from "./status.ts";

const linkClassName =
  "text-indigo-800 underline underline-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600";

const factView = (term: string, value: string, h: HtmlBuilder<Message>): ReadonlyArray<Html> => [
  h.dt([h.Class("font-medium text-slate-800")], [term]),
  h.dd([h.Class("text-slate-700")], [value]),
];

const statusText = (job: CanonicalJob): string =>
  Match.value(job.status).pipe(
    Match.tagsExhaustive({
      Active: () => "Open",
      Closed: ({ closedAt }) => `Closed ${closedAt}`,
    }),
  );

const descriptionView = (job: CanonicalJob, h: HtmlBuilder<Message>): Html =>
  Match.value(job.hydration).pipe(
    Match.tagsExhaustive({
      Hydrated: ({ description }) =>
        h.p([h.Class("whitespace-pre-line text-slate-800")], [description]),
      Unhydrated: () =>
        h.p([h.Class("text-slate-700")], ["The source has not supplied a description yet."]),
    }),
  );

const deadlineFacts = (job: CanonicalJob, h: HtmlBuilder<Message>): ReadonlyArray<Html> =>
  Match.value(job.hydration).pipe(
    Match.tagsExhaustive({
      Hydrated: ({ deadline }) => (deadline === undefined ? [] : factView("Deadline", deadline, h)),
      Unhydrated: () => [],
    }),
  );

/** Where the vacancy came from: the source ids and the original listing. */
const sourceView = (job: CanonicalJob, h: HtmlBuilder<Message>): Html =>
  h.section(
    [h.AriaLabelledBy("source-heading"), h.Class("flex flex-col gap-2")],
    [
      h.h2([h.Id("source-heading"), h.Class("text-lg font-semibold")], ["Source"]),
      h.p([h.Class("text-slate-700")], [`Reported by: ${Array.join(job.sources, ", ")}`]),
      h.a(
        [h.Href(job.applicationUrl), h.Rel("noopener noreferrer"), h.Class(linkClassName)],
        ["Open the original listing"],
      ),
    ],
  );

const jobDetailView = (job: CanonicalJob, h: HtmlBuilder<Message>): Html =>
  h.article(
    [h.Class("flex flex-col gap-4")],
    [
      h.h1([h.Class("text-2xl font-bold text-slate-900")], [job.title]),
      h.dl(
        [h.Class("grid grid-cols-[auto_1fr] gap-x-4 gap-y-1")],
        [
          ...factView("Employer", job.employerName, h),
          ...factView("Location", job.location, h),
          ...factView("Status", statusText(job), h),
          ...factView("Published", job.publishedAt, h),
          ...deadlineFacts(job, h),
        ],
      ),
      descriptionView(job, h),
      sourceView(job, h),
    ],
  );

const backLinkView = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.a([h.Href(jobsRouter(model.lastJobsQuery)), h.Class(linkClassName)], ["Back to vacancies"]);

/** A pending or failed load still needs the page's one heading. */
const placeholderHeading = (h: HtmlBuilder<Message>): Html =>
  h.h1([h.Class("text-2xl font-bold text-slate-900")], ["Vacancy"]);

export const view = (model: Model, jobId: string, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Class("flex flex-col gap-6")],
    [
      backLinkView(model, h),
      AsyncData.matchData(jobQuery.read(model.job, { jobId }), {
        onEmpty: () => h.div([], [placeholderHeading(h), loadingView("Loading the vacancy…", h)]),
        onFailure: (error) =>
          h.div(
            [],
            [placeholderHeading(h), errorView(error, Message.ClickedRetryJob({ jobId }), h)],
          ),
        onData: (job) => jobDetailView(job, h),
      }),
    ],
  );

export const title = (model: Model, jobId: string): string =>
  AsyncData.matchData(jobQuery.read(model.job, { jobId }), {
    onEmpty: () => "Vacancy · Job Index",
    onFailure: () => "Vacancy · Job Index",
    onData: (job) => `${job.title} · Job Index`,
  });
