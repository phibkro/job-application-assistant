import * as Match from "effect/Match";
import type { Runtime } from "foldkit";
import type { Document, Html, HtmlBuilder } from "foldkit/html";
import { GotProfileMessage } from "./Message.ts";
import type { Message } from "./Message.ts";
import { initialModel, Model, SessionAnonymous, SessionAuthenticated } from "./Model.ts";
import * as ProfileSubmodel from "./profile/index.ts";
import * as Session from "./Session.ts";
import { update } from "./update.ts";
import { browseView } from "./view/Browse.ts";
import { nav, sessionPanel } from "./view/Chrome.ts";
import { feedView } from "./view/Feed.ts";
import { jobDetailView } from "./view/JobDetail.ts";

// The Foldkit-idiomatic split: this module defines the program (Model,
// init, update, view) and stays importable — by `update.test.ts`, by any
// future Scene test — without booting a runtime. `entry.ts` is the only
// module that touches the DOM.
export { Model, update };
export type { Message };

/** Reads the previously-stored session token once at startup so a returning
 *  visitor is not shown "signed out" for the one frame before their first
 *  request would have proven otherwise. This is a synchronous, read-only
 *  peek at `sessionStorage` — the same boundary `Commands.ts` reads fresh on
 *  every authenticated call — not a second source of truth: `init` only
 *  ever reads it, never writes it. */
export const init: Runtime.ApplicationInit<Model, Message> = () => {
  const token = Session.readToken();
  return [
    {
      ...initialModel,
      session: token === null ? SessionAnonymous() : SessionAuthenticated({ token }),
    },
    [],
  ];
};

export const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  title: "Job Index",
  body: h.div(
    [h.Class("min-h-screen bg-gray-50")],
    [
      h.header(
        [h.Class("sticky top-0 z-10 border-b border-gray-200 bg-white")],
        [
          h.div(
            [
              h.Class(
                "mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-3",
              ),
            ],
            [
              h.div(
                [h.Class("flex items-center gap-6")],
                [
                  h.h1([h.Class("text-lg font-semibold text-gray-900")], ["Job Index"]),
                  nav(model, h),
                ],
              ),
              sessionPanel(model, h),
            ],
          ),
        ],
      ),
      h.main(
        [],
        [
          Match.value(model.page).pipe(
            Match.withReturnType<Html>(),
            Match.tagsExhaustive({
              Browse: () => browseView(model, h),
              JobDetail: () => jobDetailView(model, h),
              Feed: () => feedView(model, h),
              Profile: () =>
                h.submodel({
                  slotId: "profile",
                  model: model.profile,
                  view: ProfileSubmodel.view,
                  viewInputs: { isAuthenticated: model.session._tag === "Authenticated" },
                  toParentMessage: (message) => GotProfileMessage({ message }),
                }),
            }),
          ),
        ],
      ),
    ],
  ),
});
