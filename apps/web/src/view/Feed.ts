import * as Option from "effect/Option";
import { AsyncData } from "foldkit";
import type { HtmlBuilder, Html } from "foldkit/html";
import type { CanonicalJob } from "@job-index/domain/Job";
import { FeedDismissClicked, FeedRequested, Navigated } from "../Message.ts";
import type { Message } from "../Message.ts";
import { PageJobDetail } from "../Model.ts";
import type { Model } from "../Model.ts";
import { button, card, pageClass, renderProblem, sectionHeading } from "./Shared.ts";

const feedItem = (job: CanonicalJob, h: HtmlBuilder<Message>): Html =>
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
            [`${job.employerName} — ${job.location}`],
          ),
        ],
      ),
      h.div(
        [h.Class("flex shrink-0 gap-2")],
        [
          button(
            {
              label: "View",
              variant: "secondary",
              onClick: Navigated({ to: PageJobDetail({ jobId: job.id }) }),
            },
            h,
          ),
          button(
            {
              label: "Dismiss",
              variant: "ghost",
              onClick: FeedDismissClicked({
                jobId: job.id,
                verdict: "not_interested",
                reason: Option.none(),
              }),
            },
            h,
          ),
        ],
      ),
    ],
  );

export const feedView = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Class(pageClass)],
    [
      sectionHeading("Fresh feed", h),
      h.p([h.Class("text-sm text-gray-500")], ["Vacancies you have not already been offered."]),
      button({ label: "Refresh", variant: "secondary", onClick: FeedRequested() }, h),
      AsyncData.matchDataSplitEmpty(model.feedResults, {
        onIdle: () => h.p([h.Class("text-sm text-gray-500")], ["Not loaded yet."]),
        onLoading: () => h.p([h.Class("text-sm text-gray-500")], ["Loading…"]),
        onFailure: (problem) => renderProblem(problem, h),
        onData: (page) =>
          page.data.length === 0
            ? h.p([h.Class("text-sm text-gray-500")], ["Nothing new since your last check."])
            : card(
                [
                  h.ul(
                    [h.Class("divide-y divide-gray-100")],
                    page.data.map((job) => feedItem(job, h)),
                  ),
                ],
                h,
              ),
      }),
    ],
  );
