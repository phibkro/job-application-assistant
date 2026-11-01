import { clsx } from "clsx";
import { Array, Option } from "effect";
import { AsyncData } from "foldkit";
import type { Html, HtmlBuilder } from "foldkit/html";
import { Button, Input } from "@foldkit/ui";
import type { CanonicalJob } from "@job-index/domain/Job";
import type { JobPage } from "@job-index/worker/Api";
import * as Filters from "../domain/filters.ts";
import { Message } from "../message.ts";
import type { Model } from "../model.ts";
import { jobsQuery } from "../query.ts";
import { type JobsRoute, jobRouter } from "../route.ts";
import { errorView, loadingView } from "./status.ts";

const inputClassName =
  "w-full rounded-md border border-slate-400 bg-white px-3 py-2 text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600";

const buttonClassName =
  "rounded-md px-4 py-2 font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2";

const filterFieldView = (
  id: string,
  labelText: string,
  value: string,
  onInput: (value: string) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  Input.view(
    {
      id,
      value,
      onInput,
      type: "search",
      toView: (attributes) =>
        h.div(
          [h.Class("flex flex-1 flex-col gap-1")],
          [
            h.label(
              [...attributes.label, h.Class("text-sm font-medium text-slate-800")],
              [labelText],
            ),
            h.input([...attributes.input, h.Class(inputClassName)]),
          ],
        ),
    },
    h,
  );

const filterFormView = (model: Model, route: JobsRoute, h: HtmlBuilder<Message>): Html =>
  h.form(
    [
      h.Role("search"),
      h.AriaLabel("Filter vacancies"),
      h.Class("flex flex-col gap-3 sm:flex-row sm:items-end"),
      h.OnSubmit(Message.SubmittedFilters()),
    ],
    [
      filterFieldView(
        "filter-term",
        "Text",
        model.termInput,
        (value) => Message.UpdatedTermInput({ value }),
        h,
      ),
      filterFieldView(
        "filter-location",
        "Location",
        model.locationInput,
        (value) => Message.UpdatedLocationInput({ value }),
        h,
      ),
      Button.view(
        {
          type: "submit",
          toView: (attributes) =>
            h.button(
              [...attributes.button, h.Class(clsx(buttonClassName, "bg-indigo-700 text-white"))],
              ["Search"],
            ),
        },
        h,
      ),
      Button.view(
        {
          isDisabled: !Filters.isFiltered(route),
          onClick: Message.ClickedClearFilters(),
          toView: (attributes) =>
            h.button(
              [
                ...attributes.button,
                h.Class(
                  clsx(
                    buttonClassName,
                    "border border-slate-400 bg-white text-slate-800 disabled:opacity-60",
                  ),
                ),
              ],
              ["Clear filters"],
            ),
        },
        h,
      ),
    ],
  );

const jobRowView = (job: CanonicalJob, h: HtmlBuilder<Message>): Html =>
  h.keyed("li")(
    job.id,
    [h.Class("rounded-lg border border-slate-200 bg-white p-4")],
    [
      h.h2(
        [h.Class("text-lg font-semibold")],
        [
          h.a(
            [
              h.Href(jobRouter({ jobId: job.id })),
              h.Class(
                "text-indigo-800 underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600",
              ),
            ],
            [job.title],
          ),
        ],
      ),
      h.p([h.Class("text-slate-700")], [`${job.employerName} · ${job.location}`]),
    ],
  );

const resultSummary = (page: JobPage): string => {
  const count = Array.length(page.data);
  const noun = count === 1 ? "vacancy" : "vacancies";
  return page.meta.nextCursor === null
    ? `${count} ${noun}`
    : `First ${count} ${noun}; narrow the filters to see others`;
};

const resultsView = (page: JobPage, h: HtmlBuilder<Message>): Html =>
  h.section(
    [h.AriaLabel("Results"), h.Class("flex flex-col gap-3")],
    [
      h.p([h.Role("status"), h.Class("text-sm text-slate-700")], [resultSummary(page)]),
      Array.match(page.data, {
        onEmpty: () =>
          h.p([h.Class("text-slate-700")], ["No current vacancies match these filters."]),
        onNonEmpty: (rows) =>
          h.ul(
            [h.Class("flex flex-col gap-3")],
            Array.map(rows, (row) => jobRowView(row, h)),
          ),
      }),
    ],
  );

export const view = (model: Model, route: JobsRoute, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Class("flex flex-col gap-6")],
    [
      h.h1([h.Class("text-2xl font-bold text-slate-900")], ["Current vacancies"]),
      filterFormView(model, route, h),
      AsyncData.matchData(
        jobsQuery.read(model.jobs, { term: route.term, location: route.location }),
        {
          onEmpty: () => loadingView("Loading vacancies…", h),
          onFailure: (error) => errorView(error, Message.ClickedRetryJobs(), h),
          onData: (page) => resultsView(page, h),
        },
      ),
    ],
  );

export const title = (route: JobsRoute): string =>
  Option.match(
    Option.orElse(route.term, () => route.location),
    {
      onNone: () => "Current vacancies · Job Index",
      onSome: (filter) => `Vacancies matching "${filter}" · Job Index`,
    },
  );
