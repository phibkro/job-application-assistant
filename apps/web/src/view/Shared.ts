import clsx from "clsx";
import * as Match from "effect/Match";
import { Button, Checkbox, Input, Select, Textarea } from "@foldkit/ui";
import type { HtmlBuilder, Html } from "foldkit/html";
import type { Problem } from "../RequestStatus.ts";

// Shared view vocabulary: every page composes these instead of writing its
// own Tailwind strings, so a button or field only has one look to change.
//
// Generic over `M` (the caller's Message type) rather than pinned to the
// root `Message` union: the profile Submodel's own view reuses every
// helper here too, and pinning would make that a type error at the call
// site (`HtmlBuilder<Message>` and `HtmlBuilder<Profile.Message>` are
// different, non-interchangeable universes — see `HtmlBuilder`'s own
// doc). None of these helpers dispatch a Message on their own behalf
// (`nav`/`sessionPanel`, which do, live in `view/Chrome.ts`, the one file
// that is genuinely root-only), so nothing here needs to know which
// universe it is called from.

// ---- LAYOUT -----------------------------------------------------------

export const pageClass = "mx-auto w-full max-w-3xl space-y-6 px-4 py-8";

/** A bordered white surface, the one visual container every screen reaches
 *  for (results, a job's detail, a stage of the apply flow, a problem). */
export const card = <M>(
  children: ReadonlyArray<Html>,
  h: HtmlBuilder<M>,
  className?: string,
): Html =>
  h.div(
    [h.Class(clsx("rounded-lg border border-gray-200 bg-white p-4 shadow-sm", className))],
    children,
  );

export const sectionHeading = <M>(text: string, h: HtmlBuilder<M>): Html =>
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

export const button = <M>(
  config: Readonly<{
    label: string;
    onClick?: M;
    variant?: ButtonVariant;
    type?: "button" | "submit" | "reset";
    isDisabled?: boolean;
    ariaCurrent?: string;
    ariaLabel?: string;
    ariaPressed?: boolean;
    ariaDescribedBy?: string;
    ariaControls?: string;
    ariaExpanded?: boolean;
  }>,
  h: HtmlBuilder<M>,
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
            ...(config.ariaCurrent === undefined ? [] : [h.AriaCurrent(config.ariaCurrent)]),
            ...(config.ariaLabel === undefined ? [] : [h.AriaLabel(config.ariaLabel)]),
            ...(config.ariaPressed === undefined
              ? []
              : [h.AriaPressed(String(config.ariaPressed))]),
            ...(config.ariaDescribedBy === undefined
              ? []
              : [h.AriaDescribedBy(config.ariaDescribedBy)]),
            ...(config.ariaControls === undefined ? [] : [h.AriaControls(config.ariaControls)]),
            ...(config.ariaExpanded === undefined ? [] : [h.AriaExpanded(config.ariaExpanded)]),
            h.Class(clsx(buttonBaseClass, buttonVariantClass[config.variant ?? "primary"])),
          ],
          [config.label],
        ),
    },
    h,
  );

/** A real link styled to match `button`, for navigation rather than an
 *  action — a plain `<a href>` so the runtime's own link-click listener
 *  turns a click into a `UrlRequested` and every native link behavior
 *  (new tab, copy link, no reload) keeps working. */
export const linkButton = <M>(
  config: Readonly<{
    label: string;
    href: string;
    variant?: ButtonVariant;
    target?: string;
    rel?: string;
  }>,
  h: HtmlBuilder<M>,
): Html =>
  h.a(
    [
      h.Href(config.href),
      ...(config.target === undefined ? [] : [h.Target(config.target)]),
      ...(config.rel === undefined ? [] : [h.Rel(config.rel)]),
      h.Class(clsx(buttonBaseClass, buttonVariantClass[config.variant ?? "primary"])),
    ],
    [config.label],
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

export const inputField = <M>(
  config: Readonly<{
    id: string;
    label: string;
    value: string;
    onInput: (value: string) => M;
    placeholder?: string;
    type?: string;
    labelClassName?: string;
    isDisabled?: boolean;
  }>,
  h: HtmlBuilder<M>,
): Html =>
  Input.view(
    {
      id: config.id,
      value: config.value,
      onInput: config.onInput,
      isDisabled: config.isDisabled ?? false,
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

export const textareaField = <M>(
  config: Readonly<{
    id: string;
    label: string;
    value: string;
    onInput: (value: string) => M;
    rows?: number;
    placeholder?: string;
  }>,
  h: HtmlBuilder<M>,
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

export const selectField = <M>(
  config: Readonly<{
    id: string;
    label: string;
    value: string;
    onChange: (value: string) => M;
    options: ReadonlyArray<Readonly<{ value: string; label: string }>>;
    labelClassName?: string;
    isDisabled?: boolean;
  }>,
  h: HtmlBuilder<M>,
): Html =>
  Select.view(
    {
      id: config.id,
      value: config.value,
      onChange: config.onChange,
      isDisabled: config.isDisabled ?? false,
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

export const checkboxField = <M>(
  config: Readonly<{
    id: string;
    label: string;
    isChecked: boolean;
    onToggle: (isChecked: boolean) => M;
    isDisabled?: boolean;
    description?: string;
  }>,
  h: HtmlBuilder<M>,
): Html =>
  Checkbox.view(
    {
      id: config.id,
      isChecked: config.isChecked,
      onToggle: config.onToggle,
      isDisabled: config.isDisabled ?? false,
      toView: (attributes) =>
        h.div(
          [
            h.Class(
              clsx(
                "inline-flex items-center gap-2 rounded-md py-1.5 text-sm text-gray-700",
                config.isDisabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
              ),
            ),
          ],
          [
            h.div(
              [
                ...attributes.checkbox,
                h.Class(
                  clsx(
                    "flex size-5 items-center justify-center rounded border shadow-sm",
                    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600",
                    config.isChecked
                      ? "border-indigo-600 bg-indigo-600"
                      : "border-gray-300 bg-white",
                  ),
                ),
              ],
              [
                h.span(
                  [
                    h.Class(
                      clsx(
                        "block size-2 rounded-sm",
                        config.isChecked ? "bg-white" : "bg-transparent",
                      ),
                    ),
                  ],
                  [],
                ),
              ],
            ),
            h.span([...attributes.label, h.Class("font-medium")], [config.label]),
            h.span(
              [...attributes.description, h.Class(srOnlyLabelClass)],
              [config.description ?? `Assign the ${config.label} label`],
            ),
          ],
        ),
    },
    h,
  );

// ---- NOT FOUND ----------------------------------------------------------

/** A stale or mistyped path — not an API `Problem`, so it gets its own
 *  small screen rather than `renderProblem`'s vocabulary. */
export const notFoundView = <M>(path: string, h: HtmlBuilder<M>): Html =>
  h.div(
    [h.Class(pageClass)],
    [
      sectionHeading("Page not found", h),
      h.p([h.Class("text-sm text-gray-500")], [`No screen matches "${path}".`]),
    ],
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
export const renderProblem = <M>(problem: Problem, h: HtmlBuilder<M>): Html =>
  Match.value(problem).pipe(
    Match.tag("Unauthorized", ({ message }) =>
      h.div(
        [h.Role("status"), h.AriaLive("polite"), h.Class(problemCardClass("info"))],
        [
          h.p([h.Class("font-semibold")], ["Sign in required."]),
          h.p([h.Class("mt-1")], [message || "Enter a session token above to continue."]),
        ],
      ),
    ),
    Match.tag("NotFound", ({ message }) =>
      h.div([h.Role("alert"), h.Class(problemCardClass("error"))], [h.p([], [message])]),
    ),
    Match.tag("UpgradeRequired", ({ capability }) =>
      h.div(
        [
          h.Role("status"),
          h.AriaLive("polite"),
          h.Class("rounded-lg border border-indigo-200 bg-indigo-50 p-4"),
        ],
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
        [h.Role("alert"), h.Class(problemCardClass("error"))],
        [h.p([], [`${platform} does not allow this: ${policy}.`])],
      ),
    ),
    Match.tag("LabelConflict", ({ name }) =>
      h.div(
        [h.Role("alert"), h.Class(problemCardClass("error"))],
        [h.p([], [`A custom label named "${name}" already exists.`])],
      ),
    ),
    Match.tag("ReservedLabelMutation", ({ name }) =>
      h.div(
        [h.Role("alert"), h.Class(problemCardClass("error"))],
        [h.p([], [`"${name}" is a system label and cannot be assigned manually.`])],
      ),
    ),
    Match.tag("InvalidApplicationTransition", ({ currentStatus, event, reason }) =>
      h.div(
        [h.Role("alert"), h.Class(problemCardClass("error"))],
        [
          h.p(
            [],
            [`Cannot record "${event}" while this application is "${currentStatus}": ${reason}`],
          ),
        ],
      ),
    ),
    Match.tag("StaleApplicationUpdate", () =>
      h.div(
        [h.Role("alert"), h.Class(problemCardClass("error"))],
        [h.p([], ["This application changed after the page loaded. Refresh Saved and try again."])],
      ),
    ),
    Match.tag("NetworkError", ({ detail }) =>
      h.div(
        [h.Role("alert"), h.Class(problemCardClass("error"))],
        [h.p([], [`Request failed: ${detail}`])],
      ),
    ),
    Match.exhaustive,
  );
