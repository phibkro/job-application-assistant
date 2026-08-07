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
            ],
          ),
        ],
        h,
      ),
      h.div(
        [h.Class("space-y-3")],
        [
          h.h3([h.Class("text-sm font-semibold text-gray-900")], ["Experience"]),
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
        [h.Class("text-sm text-gray-500")],
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
        !isAuthenticated
          ? h.p(
              [h.Class("text-sm text-gray-500")],
              ["Enter a session token above to view and edit your CV."],
            )
          : AsyncData.matchDataSplitEmpty(model.profile, {
              onIdle: () => h.p([h.Class("text-sm text-gray-500")], ["Not loaded yet."]),
              onLoading: () => h.p([h.Class("text-sm text-gray-500")], ["Loading…"]),
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
