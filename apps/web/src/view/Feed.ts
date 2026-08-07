import * as Option from "effect/Option";
import { AsyncData } from "foldkit";
import type { HtmlBuilder, Html } from "foldkit/html";
import type { CanonicalJob } from "@job-index/domain/Job";
import { FeedDismissClicked, FeedRequested, Navigated } from "../Message.ts";
import type { Message } from "../Message.ts";
import { PageJobDetail } from "../Model.ts";
import type { Model } from "../Model.ts";
import { renderProblem } from "./Shared.ts";

const feedItem = (job: CanonicalJob, h: HtmlBuilder<Message>): Html =>
  h.keyed("li")(
    job.id,
    [h.Class("job-item")],
    [
      h.strong([], [job.title]),
      h.span([], [` — ${job.employerName} — ${job.location}`]),
      h.button([h.OnClick(Navigated({ to: PageJobDetail({ jobId: job.id }) }))], ["View"]),
      h.button(
        [
          h.OnClick(
            FeedDismissClicked({ jobId: job.id, verdict: "not_interested", reason: Option.none() }),
          ),
        ],
        ["Dismiss"],
      ),
    ],
  );

export const feedView = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Class("page")],
    [
      h.h2([], ["Fresh feed"]),
      h.p([], ["Vacancies you have not already been offered."]),
      h.button([h.OnClick(FeedRequested())], ["Refresh"]),
      AsyncData.matchDataSplitEmpty(model.feedResults, {
        onIdle: () => h.p([], ["Not loaded yet."]),
        onLoading: () => h.p([], ["Loading…"]),
        onFailure: (problem) => renderProblem(problem, h),
        onData: (page) =>
          page.data.length === 0
            ? h.p([], ["Nothing new since your last check."])
            : h.ul(
                [h.Class("job-list")],
                page.data.map((job) => feedItem(job, h)),
              ),
      }),
    ],
  );
