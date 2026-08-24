import clsx from "clsx";
import * as Match from "effect/Match";
import { Button, Checkbox, Input, Select, Textarea } from "@foldkit/ui";
import type { HtmlBuilder, Html } from "foldkit/html";
import type { MatchAssessment, MatchEvidence } from "../../../worker/src/Api.ts";
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
    [
      h.Class(
        clsx(
          "rounded-m3-large border border-outline-variant bg-surface-container-low p-4 shadow-m3-1",
          className,
        ),
      ),
    ],
    children,
  );

export const sectionHeading = <M>(text: string, h: HtmlBuilder<M>): Html =>
  h.h2([h.Class("text-xl font-semibold text-on-surface")], [text]);

// ---- BUTTON -------------------------------------------------------------
// `@foldkit/ui`'s Button is headless (keyboard handling, ARIA, disabled
// gating): it hands back plain attributes and lets us own every class.

export type ButtonVariant = "primary" | "secondary" | "success" | "warning" | "ghost";

const buttonVariantClass: Record<ButtonVariant, string> = {
  primary: "bg-primary text-on-primary hover:shadow-m3-2",
  secondary:
    "border border-outline bg-surface-container text-primary hover:bg-surface-container-high",
  success: "bg-valid text-on-valid",
  // Rework and Decline are ordinary decisions, not failures, so they read as
  // muted/cautionary rather than as the red reserved for actual `Problem`s.
  warning: "bg-warning-container text-on-warning-container",
  ghost: "text-primary hover:bg-secondary-container",
};

const buttonBaseClass = clsx(
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-md px-3 py-2",
  "text-sm font-semibold shadow-sm transition",
  "disabled:cursor-not-allowed disabled:opacity-50",
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tertiary",
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
    /** Extra classes appended after the variant's own — the escape hatch the
     *  Appearance preset cards use for their swatch layout. */
    className?: string;
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
            h.Class(
              clsx(
                buttonBaseClass,
                buttonVariantClass[config.variant ?? "primary"],
                config.className,
              ),
            ),
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
  "block w-full rounded-m3-small border border-outline-variant bg-surface-container-high px-3 py-2 text-sm " +
  "text-on-surface focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary " +
  "disabled:cursor-not-allowed disabled:bg-surface-container disabled:text-on-surface-variant";

const fieldLabelClass = "block text-sm font-medium text-on-surface-variant";

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
                "inline-flex items-center gap-2 rounded-m3-small py-1.5 text-sm text-on-surface",
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
                    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tertiary",
                    config.isChecked
                      ? "border-primary bg-primary"
                      : "border-outline bg-surface-container-highest",
                  ),
                ),
              ],
              [
                h.span(
                  [
                    h.Class(
                      clsx(
                        "block size-2 rounded-sm",
                        config.isChecked ? "bg-on-primary" : "bg-transparent",
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

const evidenceText = (evidence: MatchEvidence): string =>
  `${evidence.profileValue} matches ${evidence.jobField}: ${evidence.jobValue}`;

export const matchAssessmentView = <M>(assessment: MatchAssessment, h: HtmlBuilder<M>): Html =>
  h.section(
    [
      h.DataAttribute("match-assessment", ""),
      h.DataAttribute("fit", assessment.fit),
      h.Class(
        "space-y-3 rounded-m3-medium border border-outline-variant bg-surface-container-low p-4",
      ),
    ],
    [
      h.div(
        [h.Class("flex flex-wrap items-baseline justify-between gap-2")],
        [
          h.h3(
            [h.Class("text-sm font-semibold capitalize text-primary")],
            [`${assessment.fit} fit`],
          ),
          h.p(
            [h.Class("text-sm font-medium text-on-surface-variant")],
            [`Score ${assessment.score}`],
          ),
        ],
      ),
      assessment.reasons.length === 0
        ? h.p([h.Class("text-sm text-on-surface-variant")], ["No preference evidence matched yet."])
        : h.div(
            [h.Class("space-y-1")],
            [
              h.p(
                [h.Class("text-xs font-semibold uppercase tracking-wide text-on-surface-variant")],
                ["Reasons"],
              ),
              h.ul(
                [h.Class("list-disc space-y-1 pl-5 text-sm text-on-surface")],
                assessment.reasons.map((reason) => h.li([], [evidenceText(reason)])),
              ),
            ],
          ),
      assessment.concerns.length === 0
        ? h.empty
        : h.div(
            [h.Class("space-y-1")],
            [
              h.p(
                [h.Class("text-xs font-semibold uppercase tracking-wide text-warning")],
                ["Concerns"],
              ),
              h.ul(
                [h.Class("list-disc space-y-1 pl-5 text-sm text-on-surface")],
                assessment.concerns.map((concern) => h.li([], [concern])),
              ),
            ],
          ),
    ],
  );

// ---- NOT FOUND ----------------------------------------------------------

/** A stale or mistyped path — not an API `Problem`, so it gets its own
 *  small screen rather than `renderProblem`'s vocabulary. */
export const notFoundView = <M>(path: string, h: HtmlBuilder<M>): Html =>
  h.div(
    [h.Class(pageClass)],
    [
      sectionHeading("Page not found", h),
      h.p([h.Class("text-sm text-on-surface-variant")], [`No screen matches "${path}".`]),
    ],
  );

// ---- PROBLEMS ---------------------------------------------------------

const problemCardClass = (tone: "info" | "error"): string =>
  clsx(
    "rounded-lg border p-4 text-sm",
    tone === "error"
      ? "border-error bg-error-container text-on-error-container"
      : "border-outline-variant bg-secondary-container text-on-secondary-container",
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
          h.Class("rounded-m3-large border border-secondary-container bg-secondary-container p-4"),
        ],
        [
          h.p(
            [h.Class("flex items-center gap-2 text-sm font-semibold text-on-secondary-container")],
            [h.span([h.Class("text-base")], ["✦"]), `This needs the "${capability}" capability.`],
          ),
          h.p(
            [h.Class("mt-1 text-sm text-on-secondary-container")],
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
