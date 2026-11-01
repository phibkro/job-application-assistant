import type { Runtime } from "foldkit";
import type { Document, HtmlBuilder } from "foldkit/html";
import type { Url } from "foldkit/url";
import * as Filters from "./domain/filters.ts";
import type { Message } from "./message.ts";
import { Model } from "./model.ts";
import * as JobPage from "./page/job.ts";
import * as JobsPage from "./page/jobs.ts";
import * as NotFoundPage from "./page/notFound.ts";
import { jobQuery, jobsQuery } from "./query.ts";
import { AppRoute, jobsRouter, urlToAppRoute } from "./route.ts";
import { enterRoute } from "./update.ts";

export { Message } from "./message.ts";
export { Model } from "./model.ts";
export { update } from "./update.ts";
export { jobQuery, jobsQuery } from "./query.ts";

export const init: Runtime.RoutingApplicationInit<Model, Message> = (url: Url) => {
  const route = urlToAppRoute(url);
  return enterRoute(
    Model.make({
      route,
      termInput: "",
      locationInput: "",
      jobs: jobsQuery.init(),
      job: jobQuery.init(),
      lastJobsQuery: Filters.empty,
    }),
    route,
  );
};

const headerView = (h: HtmlBuilder<Message>) =>
  h.header(
    [h.Class("border-b border-slate-200 bg-white")],
    [
      h.nav(
        [h.AriaLabel("Site"), h.Class("mx-auto max-w-3xl px-4 py-3")],
        [
          h.a(
            [
              h.Href(jobsRouter(Filters.empty)),
              h.Class(
                "font-semibold text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600",
              ),
            ],
            ["Job Index"],
          ),
        ],
      ),
    ],
  );

export const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  title: AppRoute.match(model.route, {
    Jobs: (route) => JobsPage.title(route),
    Job: ({ jobId }) => JobPage.title(model, jobId),
    NotFound: () => "Not found · Job Index",
  }),
  lang: "en",
  body: h.div(
    [h.Class("min-h-screen bg-slate-50 text-slate-900")],
    [
      headerView(h),
      h.main(
        [h.Class("mx-auto max-w-3xl px-4 py-8")],
        [
          AppRoute.match(model.route, {
            Jobs: (route) => JobsPage.view(model, route, h),
            Job: ({ jobId }) => JobPage.view(model, jobId, h),
            NotFound: ({ path }) => NotFoundPage.view(path, h),
          }),
        ],
      ),
    ],
  ),
});
