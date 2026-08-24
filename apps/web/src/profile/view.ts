import * as Option from "effect/Option";
import { AsyncData } from "foldkit";
import type { HtmlBuilder, Html } from "foldkit/html";
import { defineView } from "foldkit/submodel";
import * as ExperienceEntry from "./ExperienceEntry.ts";
import * as Message from "./Message.ts";
import type { Model, ProfileForm } from "./Model.ts";
import {
  button,
  card,
  inputField,
  pageClass,
  renderProblem,
  sectionHeading,
  textareaField,
} from "../view/Shared.ts";
import {
  colorModes,
  selectedPresetId,
  themePresets,
  type ColorMode,
  type ThemePresetId,
} from "../theme.ts";

const experienceList = (form: ProfileForm, h: HtmlBuilder<Message.Message>): Html =>
  h.div(
    [h.Class("space-y-3")],
    form.experience.map((entry, index) =>
      h.keyed("div")(
        entry.id,
        [],
        [
          h.submodel({
            slotId: `experience-${entry.id}`,
            model: entry,
            view: ExperienceEntry.view,
            viewInputs: { position: index + 1 },
            toParentMessage: (message) => Message.GotExperienceMessage({ id: entry.id, message }),
          }),
        ],
      ),
    ),
  );

const profileForm = (
  form: ProfileForm,
  saving: Model["profileSaving"],
  capabilities: ReadonlyArray<string>,
  h: HtmlBuilder<Message.Message>,
): Html =>
  h.form(
    [h.Class("space-y-6"), h.OnSubmit(Message.SaveClicked())],
    [
      card(
        [
          h.div(
            [h.Class("space-y-4")],
            [
              inputField(
                {
                  id: "profile-headline",
                  label: "Headline",
                  value: form.headline,
                  onInput: (value) => Message.HeadlineChanged({ value }),
                },
                h,
              ),
              textareaField(
                {
                  id: "profile-summary",
                  label: "Summary",
                  value: form.summary,
                  rows: 4,
                  onInput: (value) => Message.SummaryChanged({ value }),
                },
                h,
              ),
              inputField(
                {
                  id: "profile-location",
                  label: "Location",
                  value: form.location,
                  onInput: (value) => Message.LocationChanged({ value }),
                },
                h,
              ),
              inputField(
                {
                  id: "profile-languages",
                  label: "Languages",
                  value: form.languages,
                  onInput: (value) => Message.LanguagesChanged({ value }),
                },
                h,
              ),
              textareaField(
                {
                  id: "profile-skills",
                  label: "Skills, one per line",
                  value: form.skillsText,
                  rows: 4,
                  onInput: (value) => Message.SkillsTextChanged({ value }),
                },
                h,
              ),
              textareaField(
                {
                  id: "profile-education",
                  label: "Education, one per line",
                  value: form.educationText,
                  rows: 3,
                  onInput: (value) => Message.EducationTextChanged({ value }),
                },
                h,
              ),
              h.fieldset(
                [h.Class("space-y-4 border-t border-outline-variant pt-4")],
                [
                  h.legend(
                    [h.Class("text-sm font-semibold text-on-surface")],
                    ["Shortlist preferences"],
                  ),
                  h.p(
                    [h.Class("text-sm text-on-surface-variant")],
                    ["These preferences rank and explain your fresh feed."],
                  ),
                  textareaField(
                    {
                      id: "profile-desired-roles",
                      label: "Desired roles, one per line",
                      value: form.desiredRolesText,
                      rows: 3,
                      onInput: (value) => Message.DesiredRolesTextChanged({ value }),
                    },
                    h,
                  ),
                  textareaField(
                    {
                      id: "profile-desired-locations",
                      label: "Desired locations, one per line",
                      value: form.desiredLocationsText,
                      rows: 3,
                      onInput: (value) => Message.DesiredLocationsTextChanged({ value }),
                    },
                    h,
                  ),
                  textareaField(
                    {
                      id: "profile-excluded-terms",
                      label: "Excluded terms, one per line",
                      value: form.excludedTermsText,
                      rows: 3,
                      onInput: (value) => Message.ExcludedTermsTextChanged({ value }),
                    },
                    h,
                  ),
                ],
              ),
            ],
          ),
        ],
        h,
      ),
      h.div(
        [h.Class("space-y-3")],
        [
          h.h3([h.Class("text-sm font-semibold text-on-surface")], ["Experience"]),
          experienceList(form, h),
          button(
            {
              label: "Add experience",
              type: "button",
              variant: "secondary",
              onClick: Message.ExperienceAdded(),
            },
            h,
          ),
        ],
      ),
      h.p(
        [h.Class("text-sm text-on-surface-variant")],
        ["Account capabilities: ", capabilities.length === 0 ? "none" : capabilities.join(", ")],
      ),
      saving._tag === "Failed" ? renderProblem(saving.problem, h) : h.empty,
      button(
        {
          label: saving._tag === "Pending" ? "Saving…" : "Save profile",
          type: "submit",
          isDisabled: saving._tag === "Pending",
        },
        h,
      ),
    ],
  );

// ---- APPEARANCE (WS-0013-r1) ---------------------------------------------
// The local preference editor: six named presets (swatch cards), an explicit
// three-way mode group, and a reset to the default. Rendered for signed-out
// visitors too — appearance is per-device, not per-account, and never
// touches the server.

const modeLabel: Record<ColorMode, string> = { system: "System", light: "Light", dark: "Dark" };

const appearanceSection = (model: Model, h: HtmlBuilder<Message.Message>): Html => {
  const activePreset = selectedPresetId(model.themePreference);
  return h.section(
    [h.AriaLabel("Appearance"), h.Class("space-y-4")],
    [
      h.h3([h.Class("text-base font-semibold text-on-surface")], ["Appearance"]),
      h.p(
        [h.Class("text-sm text-on-surface-variant")],
        ["Choose a palette and how the app follows your device."],
      ),
      h.ul(
        [h.AriaLabel("Palette"), h.Class("grid grid-cols-2 gap-3 sm:grid-cols-3")],
        themePresets.map((preset) =>
          h.keyed("li")(
            preset.id,
            [],
            [
              button(
                {
                  label: `${presetLabel(preset.id)} — ${presetDescription(preset.id)}`,
                  variant: activePreset === preset.id ? "primary" : "secondary",
                  ariaPressed: activePreset === preset.id,
                  className: `theme-preset-card theme-preset-card--${preset.id} w-full flex-col items-start gap-2 rounded-m3-large border p-3 text-left`,
                  onClick: Message.ThemePresetChanged({ value: preset.id satisfies ThemePresetId }),
                },
                h,
              ),
            ],
          ),
        ),
      ),
      h.fieldset(
        [h.Class("space-y-2")],
        [
          h.legend([h.Class("sr-only")], ["Light and dark mode"]),
          h.div(
            [h.Class("flex flex-wrap items-center gap-2")],
            colorModes.map((mode) =>
              button(
                {
                  label: modeLabel[mode],
                  variant: model.themePreference.mode === mode ? "primary" : "secondary",
                  ariaPressed: model.themePreference.mode === mode,
                  onClick: Message.ColorModeChanged({ value: mode }),
                },
                h,
              ),
            ),
          ),
        ],
      ),
      h.p(
        [h.Class("text-sm text-on-surface-variant")],
        ["Swatch preview: surface, accent container, accent, chart."],
      ),
    ],
  );
};

function presetLabel(id: ThemePresetId): string {
  switch (id) {
    case "fjord":
      return "Fjord";
    case "aurora":
      return "Aurora";
    case "birch":
      return "Birch";
    case "heather":
      return "Heather";
    case "pine":
      return "Pine";
    case "polar-night":
      return "Polar Night";
  }
}

function presetDescription(id: ThemePresetId): string {
  switch (id) {
    case "fjord":
      return "clear blues over cool mist";
    case "aurora":
      return "violet lights over zinc";
    case "birch":
      return "warm amber over stone";
    case "heather":
      return "rose tones over mauve";
    case "pine":
      return "emerald growth on olive";
    case "polar-night":
      return "sky glow on near-black";
  }
}

/** The Anonymous/Authenticated gate does not belong in this Model: it is
 *  session state the root already owns (`Model.session`), and the profile
 *  cluster has no reason to keep a second copy of it just to decide what
 *  its own view shows. `viewInputs` is the read-only, render-time channel
 *  `h.submodel` provides for exactly this — ancestor-owned data a child's
 *  view needs but must not store. */
export type ViewInputs = Readonly<{ isAuthenticated: boolean }>;

export const view = defineView<Model, Message.Message, ViewInputs>(
  (model, { isAuthenticated }, h) =>
    h.div(
      [h.Class(pageClass)],
      [
        sectionHeading("Profile", h),
        appearanceSection(model, h),
        !isAuthenticated
          ? h.p(
              [h.Class("text-sm text-on-surface-variant")],
              ["Enter your session token in the sidebar to view and edit your CV."],
            )
          : AsyncData.matchDataSplitEmpty(model.profile, {
              onIdle: () => h.p([h.Class("text-sm text-on-surface-variant")], ["Not loaded yet."]),
              onLoading: () => h.p([h.Class("text-sm text-on-surface-variant")], ["Loading…"]),
              onFailure: (problem) => renderProblem(problem, h),
              onData: (response) =>
                Option.match(model.profileForm, {
                  onNone: () => h.empty,
                  onSome: (form) =>
                    profileForm(form, model.profileSaving, response.capabilities, h),
                }),
            }),
      ],
    ),
);
