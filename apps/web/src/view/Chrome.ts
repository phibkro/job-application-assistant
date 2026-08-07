import clsx from "clsx";
import type { HtmlBuilder, Html } from "foldkit/html";
import { SessionCleared, SessionTokenInputChanged, SessionTokenSubmitted } from "../Message.ts";
import type { Message } from "../Message.ts";
import type { Model, Page } from "../Model.ts";
import * as Route from "../Route.ts";
import { button, inputField, srOnlyLabelClass } from "./Shared.ts";

// The page header: root-only, unlike everything in `Shared.ts`. Both
// components dispatch the root `Message` directly (`SessionCleared`, ...),
// which is exactly the concrete-Message-universe dependency `Shared.ts`'s
// helpers were split off from — keeping it here instead is what makes
// `Shared.ts` reusable by the profile Submodel's own view without dragging
// its own `Message` import along.
//
// Real `<a href>`s, not buttons with an `OnClick`: the runtime's own
// link-click listener is what turns a click into a `UrlRequested`, so a tab
// only has to carry the URL it goes to, not a Message that reimplements
// what clicking a link already means (open in a new tab, copy the link,
// no full reload).

const navLinkClass = (isActive: boolean): string =>
  clsx(
    "rounded-md px-3 py-1.5 text-sm font-medium transition cursor-pointer",
    isActive
      ? "bg-indigo-50 text-indigo-700"
      : "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
  );

const isCurrentPage = (page: Page, tag: Page["_tag"]): boolean => page._tag === tag;

export const nav = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.nav(
    [h.Class("flex items-center gap-1")],
    [
      h.a(
        [
          h.Class(navLinkClass(isCurrentPage(model.page, "Browse"))),
          // Carries whatever's currently in the search boxes, mirroring
          // the results already on screen — not the last *submitted*
          // query, which could be stale relative to a mid-typed edit.
          h.Href(Route.href(Route.RouteBrowse(model.browseQuery))),
        ],
        ["Browse"],
      ),
      h.a(
        [
          h.Class(navLinkClass(isCurrentPage(model.page, "Feed"))),
          h.Href(Route.href(Route.RouteFeed())),
        ],
        ["Fresh feed"],
      ),
      h.a(
        [
          h.Class(navLinkClass(isCurrentPage(model.page, "Profile"))),
          h.Href(Route.href(Route.RouteProfile())),
        ],
        ["Profile"],
      ),
    ],
  );

/**
 * The session entry point. There is no login flow in this contract — an
 * account presents a session token or API key it already holds (see
 * `Accounts.authenticate` in the worker) — so this is a paste box, not a
 * form. The token never touches `localStorage`; `SessionTokenSubmitted` and
 * `SessionCleared` are the only two Messages that change it, and both route
 * through a Command that writes `sessionStorage` (see `Session.ts`).
 */
export const sessionPanel = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Class("flex items-center gap-2")],
    model.session._tag === "Authenticated"
      ? [
          h.span([h.Class("text-sm text-gray-600")], ["Signed in."]),
          button({ label: "Clear session", onClick: SessionCleared(), variant: "secondary" }, h),
        ]
      : [
          inputField(
            {
              id: "session-token",
              label: "Session token or API key",
              labelClassName: srOnlyLabelClass,
              value: model.sessionTokenInput,
              type: "password",
              placeholder: "Session token or API key",
              onInput: (value) => SessionTokenInputChanged({ value }),
            },
            h,
          ),
          button({ label: "Use token", onClick: SessionTokenSubmitted(), variant: "secondary" }, h),
        ],
  );
