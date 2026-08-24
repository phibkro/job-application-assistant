import clsx from "clsx";
import { inertHtml, type HtmlBuilder, type Html } from "foldkit/html";
import { SessionCleared, SessionTokenInputChanged, SessionTokenSubmitted } from "../Message.ts";
import type { Message } from "../Message.ts";
import type { Model, Page } from "../Model.ts";
import * as Route from "../Route.ts";
import { button, inputField, srOnlyLabelClass } from "./Shared.ts";
import { icon } from "./icons.ts";

// The application shell (WS-0013-r1), ported from course-data-platform's
// `navigation.ts`: desktop gets a fixed left sidebar, phone widths get a
// bottom bar, and both render the SAME explicit navigation model — one list
// of destinations, each a real `<a href>` so the runtime's link-click
// listener turns clicks into `UrlRequested` and every native link behaviour
// (open in new tab, copy link) keeps working. `aria-current="page"` marks
// the destination the model says is showing; nothing dispatches a page
// change directly.
//
// Breakpoints deliberately use the source's raw media queries rather than
// Tailwind's `md:`/`lg:` aliases: the sidebar hides below 34rem of HEIGHT as
// well as 48rem of width, so short landscape windows fall back to the bottom
// bar instead of clipping.
//
// This file remains root-only: it is the one place whose components dispatch
// concrete root Messages (`SessionCleared`, ...) — see `Shared.ts`'s header.

/** One destination. All four product surfaces are live in this build, so —
 *  unlike the source app — there are no disabled "planned" items. */
interface NavigationItem {
  readonly id: string;
  readonly label: string;
  readonly icon: "browse" | "feed" | "bookmark" | "person";
  readonly href: string;
}

const navigationItems = (model: Model): ReadonlyArray<NavigationItem> => [
  {
    id: "Browse",
    label: "Browse",
    icon: "browse",
    href: Route.href(Route.RouteBrowse(model.browseQuery)),
  },
  { id: "Feed", label: "Fresh feed", icon: "feed", href: Route.href(Route.RouteFeed()) },
  { id: "Saved", label: "Saved", icon: "bookmark", href: Route.href(Route.RouteSaved()) },
  { id: "Profile", label: "Profile", icon: "person", href: Route.href(Route.RouteProfile()) },
];

const isCurrentPage = (page: Page, tag: Page["_tag"]): boolean => page._tag === tag;

const desktopItem = <M>(item: NavigationItem, isActive: boolean): Html => {
  const h = inertHtml as unknown as HtmlBuilder<M>;
  return h.a(
    [
      h.Href(item.href),
      h.Class(
        clsx(
          "flex items-center gap-3 min-h-12 py-3 px-4 rounded-[1.75rem] font-[650] no-underline",
          isActive
            ? "bg-secondary-container text-on-secondary-container"
            : "text-on-surface-variant hover:bg-surface-container-high",
        ),
      ),
      ...(isActive ? [h.AriaCurrent("page")] : []),
    ],
    [icon<M>(item.icon, "grid size-6 flex-none place-items-center"), h.span([], [item.label])],
  );
};

const mobileItem = <M>(item: NavigationItem, isActive: boolean): Html => {
  const h = inertHtml as unknown as HtmlBuilder<M>;
  return h.a(
    [
      h.Href(item.href),
      h.Class(
        clsx(
          "flex min-w-0 min-h-16 items-center justify-center gap-[0.2rem] flex-col text-xs font-[650] leading-none no-underline [-webkit-tap-highlight-color:transparent]",
          isActive ? "text-primary" : "text-on-surface-variant",
        ),
      ),
      ...(isActive ? [h.AriaCurrent("page")] : []),
    ],
    [
      icon<M>(item.icon, "grid size-7 place-items-center"),
      h.span([h.Class("max-w-full truncate")], [item.label]),
    ],
  );
};

/** Desktop: a fixed sidebar. Collapsed state was judged out of scope for the
 *  port (see WS-0013-r1); the width matches the source's expanded rail. */
export const desktopNavigation = <M>(model: Model, h: HtmlBuilder<M>): Html =>
  h.aside(
    [
      h.Class(
        "fixed inset-y-0 left-0 hidden w-66 px-3 py-6 bg-surface-container-low border-r border-outline-variant [@media(min-width:48rem)_and_(min-height:34rem)]:flex [@media(min-width:48rem)_and_(min-height:34rem)]:flex-col",
      ),
      h.AriaLabel("Primary"),
    ],
    [
      h.div(
        [h.Class("flex items-center gap-3 px-2 pt-1 pb-8")],
        [
          h.span(
            [
              h.Class(
                "grid size-10 place-items-center rounded-[0.875rem] bg-primary text-on-primary text-lg font-[750]",
              ),
              h.AriaHidden(true),
            ],
            ["J"],
          ),
          h.h1(
            [h.Class("text-[1.125rem] font-[750] tracking-[-0.02em] text-on-surface")],
            ["Job Index"],
          ),
        ],
      ),
      h.nav(
        [h.AriaLabel("Sections"), h.Class("grid gap-1")],
        navigationItems(model).map((item) =>
          desktopItem(item, isCurrentPage(model.page, item.id as Page["_tag"])),
        ),
      ),
      h.div(
        [h.Class("mt-auto px-2 pt-4 border-t border-outline-variant")],
        [
          h.p(
            [h.Class("text-sm leading-[1.5] text-on-surface-variant")],
            ["Facts stay attributable. Missing information stays visible."],
          ),
        ],
      ),
    ],
  );

/** Mobile: a Material bottom bar. The active pill treatment of the source is
 *  reduced to colour here; the structural contract (same items, same order,
 *  safe-area padding, elevated surface) is what this port preserves. */
export const mobileNavigation = <M>(model: Model, h: HtmlBuilder<M>): Html =>
  h.nav(
    [
      h.Class(
        "fixed z-10 inset-x-0 bottom-0 grid grid-cols-4 min-h-[calc(4.75rem_+_env(safe-area-inset-bottom))] pt-2 pr-[max(0.25rem,env(safe-area-inset-right))] pb-[max(0.5rem,env(safe-area-inset-bottom))] pl-[max(0.25rem,env(safe-area-inset-left))] border-t border-outline-variant bg-surface-container shadow-m3-2 [@media(min-width:48rem)_and_(min-height:34rem)]:hidden",
      ),
      h.AriaLabel("Primary"),
    ],
    navigationItems(model).map((item) =>
      mobileItem(item, isCurrentPage(model.page, item.id as Page["_tag"])),
    ),
  );

/**
 * The session entry point. There is no login flow in this contract — an
 * owner pastes the token they were given, it is verified by first use, and
 * clearing it signs out. On desktop this lives at the foot of the sidebar;
 * on phone widths it renders as a slim strip at the top of the main column
 * (rendered there by `main.ts`) so sign-in stays reachable without adding a
 * second tab strip.
 */
export const sessionPanel = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.section(
    [
      h.Class(
        "fixed top-0 right-0 z-10 w-full bg-surface-container-low px-4 py-3 shadow-m3-1 " +
          "[@media(min-width:48rem)_and_(min-height:34rem)]:left-66 " +
          "[@media(min-width:48rem)_and_(min-height:34rem)]:top-auto " +
          "[@media(min-width:48rem)_and_(min-height:34rem)]:bottom-0 " +
          "[@media(min-width:48rem)_and_(min-height:34rem)]:w-auto " +
          "[@media(min-width:48rem)_and_(min-height:34rem)]:border-t " +
          "[@media(min-width:48rem)_and_(min-height:34rem)]:border-outline-variant " +
          "[@media(min-width:48rem)_and_(min-height:34rem)]:px-4 " +
          "[@media(min-width:48rem)_and_(min-height:34rem)]:py-4",
      ),
      h.AriaLabel("Session"),
    ],
    [sessionPanelBody(model, h)],
  );

const sessionPanelBody = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Class("flex w-full flex-col gap-2 sm:flex-row sm:items-center")],
    model.session._tag === "Authenticated"
      ? [
          h.span([h.Class("text-sm text-on-surface-variant")], ["Signed in."]),
          button({ label: "Sign out", variant: "secondary", onClick: SessionCleared() }, h),
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
