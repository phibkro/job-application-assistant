import * as Option from "effect/Option";
import { AsyncData } from "foldkit";
import type { HtmlBuilder, Html } from "foldkit/html";
import type { MatchedJob } from "../../../worker/src/Api.ts";
import { FeedDismissClicked, FeedRequested } from "../Message.ts";
import type { Message } from "../Message.ts";
import type { Model } from "../Model.ts";
import * as Route from "../Route.ts";
import {
  button,
  card,
  linkButton,
  matchAssessmentView,
  pageClass,
  renderProblem,
  sectionHeading,
} from "./Shared.ts";

const feedItem = (matched: MatchedJob, h: HtmlBuilder<Message>): Html => {
  const { job, assessment } = matched;
  return h.keyed("li")(
    job.id,
    [
      h.DataAttribute("job-title", job.title),
      h.DataAttribute("fit", assessment.fit),
      h.Class("space-y-4 py-5"),
    ],
    [
      h.div(
        [h.Class("flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between")],
        [
          h.div(
            [h.Class("min-w-0")],
            [
              h.h3([h.Class("font-medium text-gray-900")], [job.title]),
              h.p(
                [h.Class("mt-1 text-sm text-gray-500")],
                [`${job.employerName} — ${job.location}`],
              ),
            ],
          ),
          h.div(
            [h.Class("flex shrink-0 gap-2")],
            [
              linkButton(
                {
                  label: "View",
                  variant: "secondary",
                  href: Route.href(Route.RouteJobDetail({ jobId: job.id })),
                },
                h,
              ),
              button(
                {
                  label: "Dismiss",
                  variant: "ghost",
                  onClick: FeedDismissClicked({
                    jobId: job.id,
                    verdict: "dismissed",
                    reason: Option.none(),
                  }),
                },
                h,
              ),
            ],
          ),
        ],
      ),
      matchAssessmentView(assessment, h),
    ],
  );
};

export const feedView = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Class(pageClass)],
    [
      sectionHeading("Fresh feed", h),
      h.p(
        [h.Class("text-sm text-gray-500")],
        ["A ranked shortlist with the profile evidence behind every fit."],
      ),
      button({ label: "Refresh", variant: "secondary", onClick: FeedRequested() }, h),
      AsyncData.matchDataSplitEmpty(model.feedResults, {
        onIdle: () => h.p([h.Class("text-sm text-gray-500")], ["Not loaded yet."]),
        onLoading: () =>
          h.p([h.Role("status"), h.Class("text-sm text-gray-500")], ["Loading matches…"]),
        onFailure: (problem) => renderProblem(problem, h),
        onData: (page) =>
          page.data.length === 0
            ? h.div(
                [h.Class("space-y-2 rounded-lg border border-gray-200 bg-white p-4")],
                [
                  h.p([h.Class("font-medium text-gray-900")], ["Your shortlist is up to date."]),
                  h.p(
                    [h.Class("text-sm text-gray-500")],
                    ["Adjust your profile preferences or refresh after new vacancies arrive."],
                  ),
                ],
              )
            : card(
                [
                  h.ul(
                    [h.Class("divide-y divide-gray-100")],
                    page.data.map((matched) => feedItem(matched, h)),
                  ),
                ],
                h,
              ),
      }),
    ],
  );
