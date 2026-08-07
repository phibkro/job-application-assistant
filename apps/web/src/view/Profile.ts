import * as Option from "effect/Option";
import { AsyncData } from "foldkit";
import { Fieldset } from "@foldkit/ui";
import type { HtmlBuilder, Html } from "foldkit/html";
import {
  ProfileEducationTextChanged,
  ProfileExperienceAdded,
  ProfileExperienceEmployerChanged,
  ProfileExperienceHighlightsTextChanged,
  ProfileExperiencePeriodChanged,
  ProfileExperienceRemoved,
  ProfileExperienceTitleChanged,
  ProfileHeadlineChanged,
  ProfileLanguagesChanged,
  ProfileLocationChanged,
  ProfileSaveClicked,
  ProfileSkillsTextChanged,
  ProfileSummaryChanged,
} from "../Message.ts";
import type { Message } from "../Message.ts";
import type { ExperienceForm, Model, ProfileForm } from "../Model.ts";
import {
  button,
  card,
  inputField,
  pageClass,
  renderProblem,
  sectionHeading,
  textareaField,
} from "./Shared.ts";

const experienceEntry = (index: number, entry: ExperienceForm, h: HtmlBuilder<Message>): Html => {
  const id = `experience-${index}`;
  return h.keyed("div")(
    index,
    [],
    [
      Fieldset.view(
        {
          id,
          toView: (attributes) =>
            h.fieldset(
              [...attributes.fieldset, h.Class("space-y-3 rounded-lg border border-gray-200 p-4")],
              [
                h.legend(
                  [...attributes.legend, h.Class("px-1 text-sm font-semibold text-gray-900")],
                  [`Experience ${index + 1}`],
                ),
                inputField(
                  {
                    id: `${id}-title`,
                    label: "Title",
                    value: entry.title,
                    onInput: (value) => ProfileExperienceTitleChanged({ index, value }),
                  },
                  h,
                ),
                inputField(
                  {
                    id: `${id}-employer`,
                    label: "Employer",
                    value: entry.employer,
                    onInput: (value) => ProfileExperienceEmployerChanged({ index, value }),
                  },
                  h,
                ),
                inputField(
                  {
                    id: `${id}-period`,
                    label: "Period",
                    value: entry.period,
                    onInput: (value) => ProfileExperiencePeriodChanged({ index, value }),
                  },
                  h,
                ),
                textareaField(
                  {
                    id: `${id}-highlights`,
                    label: "Highlights, one per line",
                    value: entry.highlightsText,
                    rows: 3,
                    onInput: (value) => ProfileExperienceHighlightsTextChanged({ index, value }),
                  },
                  h,
                ),
                button(
                  {
                    label: "Remove",
                    type: "button",
                    variant: "ghost",
                    onClick: ProfileExperienceRemoved({ index }),
                  },
                  h,
                ),
              ],
            ),
        },
        h,
      ),
    ],
  );
};

const profileForm = (
  form: ProfileForm,
  saving: Model["profileSaving"],
  capabilities: ReadonlyArray<string>,
  h: HtmlBuilder<Message>,
): Html =>
  h.form(
    [h.Class("space-y-6"), h.OnSubmit(ProfileSaveClicked())],
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
                  onInput: (value) => ProfileHeadlineChanged({ value }),
                },
                h,
              ),
              textareaField(
                {
                  id: "profile-summary",
                  label: "Summary",
                  value: form.summary,
                  rows: 4,
                  onInput: (value) => ProfileSummaryChanged({ value }),
                },
                h,
              ),
              inputField(
                {
                  id: "profile-location",
                  label: "Location",
                  value: form.location,
                  onInput: (value) => ProfileLocationChanged({ value }),
                },
                h,
              ),
              inputField(
                {
                  id: "profile-languages",
                  label: "Languages",
                  value: form.languages,
                  onInput: (value) => ProfileLanguagesChanged({ value }),
                },
                h,
              ),
              textareaField(
                {
                  id: "profile-skills",
                  label: "Skills, one per line",
                  value: form.skillsText,
                  rows: 4,
                  onInput: (value) => ProfileSkillsTextChanged({ value }),
                },
                h,
              ),
              textareaField(
                {
                  id: "profile-education",
                  label: "Education, one per line",
                  value: form.educationText,
                  rows: 3,
                  onInput: (value) => ProfileEducationTextChanged({ value }),
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
          h.div(
            [h.Class("space-y-3")],
            form.experience.map((entry, index) => experienceEntry(index, entry, h)),
          ),
          button(
            {
              label: "Add experience",
              type: "button",
              variant: "secondary",
              onClick: ProfileExperienceAdded(),
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

export const profileView = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Class(pageClass)],
    [
      sectionHeading("Profile", h),
      model.session._tag === "Anonymous"
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
                onSome: (form) => profileForm(form, model.profileSaving, response.capabilities, h),
              }),
          }),
    ],
  );
