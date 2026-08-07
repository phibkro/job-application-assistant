import clsx from "clsx";
import * as Match from "effect/Match";
import { Button, Input, Select, Textarea } from "@foldkit/ui";
import type { HtmlBuilder, Html } from "foldkit/html";
import {
  Navigated,
  SessionCleared,
  SessionTokenInputChanged,
  SessionTokenSubmitted,
} from "../Message.ts";
import type { Message } from "../Message.ts";
import { PageBrowse, PageFeed, PageProfile } from "../Model.ts";
import type { Model, Page, Problem } from "../Model.ts";

// Shared view vocabulary: every page composes these instead of writing its
// own Tailwind strings, so a button or field only has one look to change.

// ---- LAYOUT -----------------------------------------------------------

export const pageClass = "mx-auto w-full max-w-3xl space-y-6 px-4 py-8";

/** A bordered white surface, the one visual container every screen reaches
 *  for (results, a job's detail, a stage of the apply flow, a problem). */
export const card = (
  children: ReadonlyArray<Html>,
  h: HtmlBuilder<Message>,
  className?: string,
): Html =>
  h.div(
    [h.Class(clsx("rounded-lg border border-gray-200 bg-white p-4 shadow-sm", className))],
    children,
  );

export const sectionHeading = (text: string, h: HtmlBuilder<Message>): Html =>
  h.h2([h.Class("text-xl font-semibold text-gray-900")], [text]);

// ---- BUTTON -------------------------------------------------------------
// `@foldkit/ui`'s Button is headless (keyboard handling, ARIA, disabled
// gating): it hands back plain attributes and lets us own every class.

export type ButtonVariant = "primary" | "secondary" | "success" | "warning" | "ghost";

const buttonVariantClass: Record<ButtonVariant, string> = {
  primary: "bg-indigo-600 text-white hover:bg-indigo-700",
  secondary: "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50",
  success: "bg-green-600 text-white hover:bg-green-700",
  // Rework and Decline are ordinary decisions, not failures, so they read as
  // muted/cautionary rather than as the red reserved for actual `Problem`s.
  warning: "border border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100",
  ghost: "text-indigo-700 hover:bg-indigo-50",
};

const buttonBaseClass = clsx(
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-md px-3 py-2",
  "text-sm font-semibold shadow-sm transition",
  "disabled:cursor-not-allowed disabled:opacity-50",
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600",
);

export const button = (
  config: Readonly<{
    label: string;
    onClick?: Message;
    variant?: ButtonVariant;
    type?: "button" | "submit" | "reset";
    isDisabled?: boolean;
  }>,
  h: HtmlBuilder<Message>,
): Html =>
  Button.view(
    {
      onClick: config.onClick,
      isDisabled: config.isDisabled ?? false,
      type: config.type ?? "button",
      toView: (attributes) =>
        h.button(
          [
            ...attributes.button,
            h.Class(clsx(buttonBaseClass, buttonVariantClass[config.variant ?? "primary"])),
          ],
          [config.label],
        ),
    },
    h,
  );

// ---- FORM FIELDS ----------------------------------------------------------
// One shared look for every labelled control: the label sits above the
// control (via the component's own `attributes.label`, which carries the
// `for`/`id` pairing), so labelling survives restyling by construction
// rather than by remembering to keep a `<label>` wrapped around an input.

const controlClass =
  "block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm " +
  "focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 " +
  "disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500";

const fieldLabelClass = "block text-sm font-medium text-gray-700";

/** A label that stays reachable to assistive tech without taking up layout
 *  space — for the handful of controls (search term, session token) whose
 *  placeholder already carries the visible name. */
export const srOnlyLabelClass = "sr-only";

export const inputField = (
  config: Readonly<{
    id: string;
    label: string;
    value: string;
    onInput: (value: string) => Message;
    placeholder?: string;
    type?: string;
    labelClassName?: string;
  }>,
  h: HtmlBuilder<Message>,
): Html =>
  Input.view(
    {
      id: config.id,
      value: config.value,
      onInput: config.onInput,
      ...(config.placeholder !== undefined && { placeholder: config.placeholder }),
      ...(config.type !== undefined && { type: config.type }),
      toView: (attributes) =>
        h.div(
          [h.Class("space-y-1")],
          [
            h.label(
              [...attributes.label, h.Class(config.labelClassName ?? fieldLabelClass)],
              [config.label],
            ),
            h.input([...attributes.input, h.Class(controlClass)]),
          ],
        ),
    },
    h,
  );

export const textareaField = (
  config: Readonly<{
    id: string;
    label: string;
    value: string;
    onInput: (value: string) => Message;
    rows?: number;
    placeholder?: string;
  }>,
  h: HtmlBuilder<Message>,
): Html =>
  Textarea.view(
    {
      id: config.id,
      value: config.value,
      onInput: config.onInput,
      ...(config.rows !== undefined && { rows: config.rows }),
      ...(config.placeholder !== undefined && { placeholder: config.placeholder }),
      toView: (attributes) =>
        h.div(
          [h.Class("space-y-1")],
          [
            h.label([...attributes.label, h.Class(fieldLabelClass)], [config.label]),
            h.textarea([...attributes.textarea, h.Class(controlClass)]),
          ],
        ),
    },
    h,
  );

export const selectField = (
  config: Readonly<{
    id: string;
    label: string;
    value: string;
    onChange: (value: string) => Message;
    options: ReadonlyArray<Readonly<{ value: string; label: string }>>;
    labelClassName?: string;
  }>,
  h: HtmlBuilder<Message>,
): Html =>
  Select.view(
    {
      id: config.id,
      value: config.value,
      onChange: config.onChange,
      toView: (attributes) =>
        h.div(
          [h.Class("space-y-1")],
          [
            h.label(
              [...attributes.label, h.Class(config.labelClassName ?? fieldLabelClass)],
              [config.label],
            ),
            h.select(
              [...attributes.select, h.Class(controlClass)],
              config.options.map((option) => h.option([h.Value(option.value)], [option.label])),
            ),
          ],
        ),
    },
    h,
  );

// ---- PROBLEMS ---------------------------------------------------------

const problemCardClass = (tone: "info" | "error"): string =>
  clsx(
    "rounded-lg border p-4 text-sm",
    tone === "error"
      ? "border-red-200 bg-red-50 text-red-800"
      : "border-blue-200 bg-blue-50 text-blue-800",
  );

/**
 * Renders any `Problem` without a stack trace in sight.
 *
 * `UpgradeRequired` (the 402 case) gets deliberately different treatment
 * from every other `Problem`: an indigo upsell card with no red, no "error"
 * language, and a callout of what upgrading buys — because trying a
 * capability the plan does not have is a normal, expected outcome, not a
 * failure. Every other member keeps the flat red/blue "something to notice"
 * treatment appropriate to an actual error or a sign-in prompt.
 */
export const renderProblem = (problem: Problem, h: HtmlBuilder<Message>): Html =>
  Match.value(problem).pipe(
    Match.tag("Unauthorized", ({ message }) =>
      h.div(
        [h.Class(problemCardClass("info"))],
        [
          h.p([h.Class("font-semibold")], ["Sign in required."]),
          h.p([h.Class("mt-1")], [message || "Enter a session token above to continue."]),
        ],
      ),
    ),
    Match.tag("NotFound", ({ message }) =>
      h.div([h.Class(problemCardClass("error"))], [h.p([], [message])]),
    ),
    Match.tag("UpgradeRequired", ({ capability }) =>
      h.div(
        [h.Class("rounded-lg border border-indigo-200 bg-indigo-50 p-4")],
        [
          h.p(
            [h.Class("flex items-center gap-2 text-sm font-semibold text-indigo-900")],
            [h.span([h.Class("text-base")], ["✦"]), `This needs the "${capability}" capability.`],
          ),
          h.p(
            [h.Class("mt-1 text-sm text-indigo-800")],
            [
              "Your current plan does not include it. Upgrading unlocks it for every job, not just this one.",
            ],
          ),
        ],
      ),
    ),
    Match.tag("ForbiddenByPlatform", ({ platform, policy }) =>
      h.div(
        [h.Class(problemCardClass("error"))],
        [h.p([], [`${platform} does not allow this: ${policy}.`])],
      ),
    ),
    Match.tag("NetworkError", ({ detail }) =>
      h.div([h.Class(problemCardClass("error"))], [h.p([], [`Request failed: ${detail}`])]),
    ),
    Match.exhaustive,
  );

// ---- CHROME -------------------------------------------------------------

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
      h.button(
        [
          h.Class(navLinkClass(isCurrentPage(model.page, "Browse"))),
          h.OnClick(Navigated({ to: PageBrowse() })),
        ],
        ["Browse"],
      ),
      h.button(
        [
          h.Class(navLinkClass(isCurrentPage(model.page, "Feed"))),
          h.OnClick(Navigated({ to: PageFeed() })),
        ],
        ["Fresh feed"],
      ),
      h.button(
        [
          h.Class(navLinkClass(isCurrentPage(model.page, "Profile"))),
          h.OnClick(Navigated({ to: PageProfile() })),
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
