import { AsyncData } from "foldkit";
import type { HtmlBuilder, Html } from "foldkit/html";
import type { CanonicalJob } from "@job-index/domain/Job";
import {
  BrowseLocationChanged,
  BrowseNextPageRequested,
  BrowseSearchSubmitted,
  BrowseStatusChanged,
  BrowseTermChanged,
  Navigated,
} from "../Message.ts";
import type { Message } from "../Message.ts";
import { PageJobDetail } from "../Model.ts";
import type { Model } from "../Model.ts";
import { renderProblem } from "./Shared.ts";

const statusLabel = (job: CanonicalJob): string =>
  job.status._tag === "Active" ? "Active" : `Closed ${job.status.closedAt}`;

const jobListItem = (job: CanonicalJob, h: HtmlBuilder<Message>): Html =>
  h.keyed("li")(
    job.id,
    [h.Class("job-item")],
    [
      h.strong([], [job.title]),
      h.span([], [` — ${job.employerName} — ${job.location} — ${statusLabel(job)}`]),
      h.button([h.OnClick(Navigated({ to: PageJobDetail({ jobId: job.id }) }))], ["View"]),
    ],
  );

export const browseView = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Class("page")],
    [
      h.h2([], ["Browse"]),
      h.form(
        [h.Class("search-form"), h.OnSubmit(BrowseSearchSubmitted())],
        [
          h.input([
            h.Value(model.browseQuery.term),
            h.Placeholder("Search term"),
            h.OnInput((value) => BrowseTermChanged({ value })),
          ]),
          h.input([
            h.Value(model.browseQuery.location),
            h.Placeholder("Location"),
            h.OnInput((value) => BrowseLocationChanged({ value })),
          ]),
          h.select(
            [
              h.Value(model.browseQuery.status),
              h.OnChange((value) => BrowseStatusChanged({ value })),
            ],
            [
              h.option([h.Value("")], ["Any status"]),
              h.option([h.Value("Active")], ["Active"]),
              h.option([h.Value("Closed")], ["Closed"]),
            ],
          ),
          h.button([h.Type("submit")], ["Search"]),
        ],
      ),
      AsyncData.matchDataSplitEmpty(model.browseResults, {
        onIdle: () => h.p([], ["Search to see results."]),
        onLoading: () => h.p([], ["Loading…"]),
        onFailure: (problem) => renderProblem(problem, h),
        onData: (page) =>
          h.div(
            [],
            [
              page.data.length === 0
                ? h.p([], ["No matching jobs."])
                : h.ul(
                    [h.Class("job-list")],
                    page.data.map((job) => jobListItem(job, h)),
                  ),
              page.meta.nextCursor === null
                ? h.empty
                : h.button([h.OnClick(BrowseNextPageRequested())], ["Load more"]),
            ],
          ),
      }),
    ],
  );
