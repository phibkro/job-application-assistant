import type { Html, HtmlBuilder } from "foldkit/html";
import type { Message } from "../message.ts";
import { jobsRouter } from "../route.ts";
import * as Filters from "../domain/filters.ts";

export const view = (path: string, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Class("flex flex-col gap-4")],
    [
      h.h1([h.Class("text-2xl font-bold text-slate-900")], ["Page not found"]),
      h.p([h.Class("text-slate-700")], [`Nothing lives at "${path}".`]),
      h.a(
        [
          h.Href(jobsRouter(Filters.empty)),
          h.Class(
            "text-indigo-800 underline underline-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600",
          ),
        ],
        ["Browse current vacancies"],
      ),
    ],
  );
