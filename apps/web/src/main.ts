import * as Match from "effect/Match";
import type { Runtime } from "foldkit";
import type { Document, Html, HtmlBuilder } from "foldkit/html";
import { GotProfileMessage, GotSavedMessage, UrlChanged, UrlRequested } from "./Message.ts";
import type { Message } from "./Message.ts";
import { initialModel, Model, SessionAnonymous, SessionAuthenticated } from "./Model.ts";
import * as ProfileSubmodel from "./profile/index.ts";
import * as SavedSubmodel from "./saved/index.ts";
import * as Route from "./Route.ts";
import * as Session from "./Session.ts";
import { update } from "./update.ts";
import { browseView } from "./view/Browse.ts";
import { desktopNavigation, mobileNavigation, sessionPanel } from "./view/Chrome.ts";
import { feedView } from "./view/Feed.ts";
import { jobDetailView } from "./view/JobDetail.ts";
import { notFoundView } from "./view/Shared.ts";

// The Foldkit-idiomatic split: this module defines the program (Model,
// init, update, view) and stays importable — by `update.test.ts`, by any
// future Scene test — without booting a runtime. `entry.ts` is the only
// module that touches the DOM.
export { Model, update };
export type { Message };

// The URL routing config `entry.ts` hands to `Runtime.makeApplication`:
// every internal link click and every address-bar change funnels through
// exactly these two Messages, `update.ts`'s single entry point for
// changing `page`. Exported so `entry.ts` stays a pure boot shim.
export const routing: Runtime.RoutingConfig<Message> = {
  onUrlRequest: (request) => UrlRequested({ request }),
  onUrlChange: (url) => UrlChanged({ route: Route.parse(url) }),
};

// Shell layout (WS-0013-r1). The sidebar/bottom-bar visibility media queries
// live in `Chrome.ts`; these are the content-side counterparts. Bottom
// padding keeps the last row of content clear of the fixed mobile bar plus
// its safe-area inset; on desktop the main column shifts right by the
// sidebar's width (`ml-66`) and centres within what remains.
const contentOffset =
  "w-full px-4 pt-4 pb-[calc(7rem+env(safe-area-inset-bottom))] " +
  "[@media(min-width:48rem)_and_(min-height:34rem)]:pl-6 " +
  "[@media(min-width:48rem)_and_(min-height:34rem)]:pr-6 " +
  "[@media(min-width:48rem)_and_(min-height:34rem)]:pb-20 " +
  "[@media(min-width:48rem)_and_(min-height:34rem)]:w-[min(calc(100%-16.5rem),76rem)] " +
  "[@media(min-width:48rem)_and_(min-height:34rem)]:ml-66";

/** Reads the previously-stored session token once at startup so a returning
 *  visitor is not shown "signed out" for the one frame before their first
 *  request would have proven otherwise. This is a synchronous, read-only
 *  peek at `sessionStorage` — the same boundary `Commands.ts` reads fresh on
 *  every authenticated call — not a second source of truth: `init` only
 *  ever reads it, never writes it.
 *
 *  Delegates the actual page/data decision to `update`'s `UrlChanged` arm
 *  rather than repeating it: a cold load is just the first URL this run of
 *  the app ever saw, so it goes through the identical derivation a
 *  client-side navigation does, and the two can never fall out of step. */
export const init: Runtime.RoutingApplicationInit<Model, Message> = (url) => {
  const token = Session.readToken();
  const model: Model = {
    ...initialModel,
    session: token === null ? SessionAnonymous() : SessionAuthenticated({ token }),
  };
  return update(model, UrlChanged({ route: Route.parse(url) }));
};

export const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  title: "Job Index",
  body: h.div(
    [h.Class("min-h-screen bg-surface")],
    [
      // The shell: fixed sidebar on wide screens, fixed bottom bar on narrow
      // ones (see `Chrome.ts`). `main` carries the content offset for
      // whichever is showing; `sessionPanel` is the ONE responsive session
      // surface (top strip on phones, docked at the sidebar's foot on
      // desktop), so its controls exist exactly once in the DOM.
      desktopNavigation(model, h),
      sessionPanel(model, h),
      mobileNavigation(model, h),
      h.main(
        [h.Class(contentOffset)],
        [
          Match.value(model.page).pipe(
            Match.withReturnType<Html>(),
            Match.tagsExhaustive({
              Browse: () => browseView(model, h),
              JobDetail: () => jobDetailView(model, h),
              Feed: () => feedView(model, h),
              NotFound: ({ path }) => notFoundView(path, h),
              Profile: () =>
                h.submodel({
                  slotId: "profile",
                  model: model.profile,
                  view: ProfileSubmodel.view,
                  viewInputs: { isAuthenticated: model.session._tag === "Authenticated" },
                  toParentMessage: (message) =>
                    GotProfileMessage({ sessionEpoch: model.sessionEpoch, message }),
                }),
              Saved: () =>
                h.submodel({
                  slotId: "saved",
                  model: model.saved,
                  view: SavedSubmodel.view,
                  viewInputs: { isAuthenticated: model.session._tag === "Authenticated" },
                  toParentMessage: (message) =>
                    GotSavedMessage({ sessionEpoch: model.sessionEpoch, message }),
                }),
            }),
          ),
        ],
      ),
    ],
  ),
});
