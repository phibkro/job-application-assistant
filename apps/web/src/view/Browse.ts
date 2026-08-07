import { AsyncData } from "foldkit";
import type { HtmlBuilder, Html } from "foldkit/html";
import type { CanonicalJob } from "@job-index/domain/Job";
import {
  BrowseLocationChanged,
  BrowseNextPageRequested,
  BrowseSearchSubmitted,
  BrowseStatusChanged,
  BrowseTermChanged,
} from "../Message.ts";
import type { Message } from "../Message.ts";
import type { Model } from "../Model.ts";
import * as Route from "../Route.ts";
import {
  button,
  card,
  inputField,
  linkButton,
  pageClass,
  renderProblem,
  sectionHeading,
  selectField,
  srOnlyLabelClass,
} from "./Shared.ts";

const statusLabel = (job: CanonicalJob): string =>
  job.status._tag === "Active" ? "Active" : `Closed ${job.status.closedAt}`;

const jobListItem = (job: CanonicalJob, h: HtmlBuilder<Message>): Html =>
  h.keyed("li")(
    job.id,
    [h.Class("flex items-center justify-between gap-4 py-3")],
    [
      h.div(
        [h.Class("min-w-0")],
        [
          h.p([h.Class("truncate font-medium text-gray-900")], [job.title]),
          h.p(
            [h.Class("truncate text-sm text-gray-500")],
            [`${job.employerName} — ${job.location} — ${statusLabel(job)}`],
          ),
        ],
      ),
      linkButton(
        {
          label: "View",
          variant: "secondary",
          href: Route.href(Route.RouteJobDetail({ jobId: job.id })),
        },
        h,
      ),
    ],
  );

export const browseView = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Class(pageClass)],
    [
      sectionHeading("Browse", h),
      h.form(
        [
          h.Class("grid gap-3 sm:grid-cols-[2fr_2fr_1fr_auto] sm:items-end"),
          h.OnSubmit(BrowseSearchSubmitted()),
        ],
        [
          inputField(
            {
              id: "browse-term",
              label: "Search term",
              labelClassName: srOnlyLabelClass,
              value: model.browseQuery.term,
              placeholder: "Search term",
              onInput: (value) => BrowseTermChanged({ value }),
            },
            h,
          ),
          inputField(
            {
              id: "browse-location",
              label: "Location",
              labelClassName: srOnlyLabelClass,
              value: model.browseQuery.location,
              placeholder: "Location",
              onInput: (value) => BrowseLocationChanged({ value }),
            },
            h,
          ),
          selectField(
            {
              id: "browse-status",
              label: "Status",
              labelClassName: srOnlyLabelClass,
              value: model.browseQuery.status,
              onChange: (value) => BrowseStatusChanged({ value }),
              options: [
                { value: "", label: "Any status" },
                { value: "Active", label: "Active" },
                { value: "Closed", label: "Closed" },
              ],
            },
            h,
          ),
          button({ label: "Search", type: "submit" }, h),
        ],
      ),
      AsyncData.matchDataSplitEmpty(model.browseResults, {
        onIdle: () => h.p([h.Class("text-sm text-gray-500")], ["Search to see results."]),
        onLoading: () => h.p([h.Class("text-sm text-gray-500")], ["Loading…"]),
        onFailure: (problem) => renderProblem(problem, h),
        onData: (page) =>
          h.div(
            [h.Class("space-y-4")],
            [
              page.data.length === 0
                ? h.p([h.Class("text-sm text-gray-500")], ["No matching jobs."])
                : card(
                    [
                      h.ul(
                        [h.Class("divide-y divide-gray-100")],
                        page.data.map((job) => jobListItem(job, h)),
                      ),
                    ],
                    h,
                  ),
              page.meta.nextCursor === null
                ? h.empty
                : h.div(
                    [h.Class("flex justify-center")],
                    [
                      button(
                        {
                          label: "Load more",
                          variant: "secondary",
                          onClick: BrowseNextPageRequested(),
                        },
                        h,
                      ),
                    ],
                  ),
            ],
          ),
      }),
    ],
  );
