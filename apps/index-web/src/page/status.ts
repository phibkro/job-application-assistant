import type { Html, HtmlBuilder } from "foldkit/html";
import { Button } from "@foldkit/ui";

export const loadingView = <Message>(text: string, h: HtmlBuilder<Message>): Html =>
  h.p([h.Role("status"), h.Class("text-slate-700")], [text]);

export const errorView = <Message>(
  error: string,
  onRetry: Message,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [h.Role("alert"), h.Class("flex items-center gap-3 rounded-md bg-red-50 p-4 text-red-900")],
    [
      h.p([], [error]),
      Button.view(
        {
          onClick: onRetry,
          toView: (attributes) =>
            h.button(
              [
                ...attributes.button,
                h.Class(
                  "rounded-md border border-red-800 px-3 py-1 font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-red-700",
                ),
              ],
              ["Retry"],
            ),
        },
        h,
      ),
    ],
  );
