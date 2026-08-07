import * as Option from "effect/Option";
import { AsyncData } from "foldkit";
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
import { renderProblem } from "./Shared.ts";

const experienceEntry = (index: number, entry: ExperienceForm, h: HtmlBuilder<Message>): Html =>
  h.keyed("fieldset")(
    index,
    [h.Class("experience-entry")],
    [
      h.input([
        h.Placeholder("Title"),
        h.Value(entry.title),
        h.OnInput((value) => ProfileExperienceTitleChanged({ index, value })),
      ]),
      h.input([
        h.Placeholder("Employer"),
        h.Value(entry.employer),
        h.OnInput((value) => ProfileExperienceEmployerChanged({ index, value })),
      ]),
      h.input([
        h.Placeholder("Period"),
        h.Value(entry.period),
        h.OnInput((value) => ProfileExperiencePeriodChanged({ index, value })),
      ]),
      h.textarea(
        [
          h.Placeholder("Highlights, one per line"),
          h.Rows(3),
          h.OnInput((value) => ProfileExperienceHighlightsTextChanged({ index, value })),
        ],
        [entry.highlightsText],
      ),
      h.button([h.Type("button"), h.OnClick(ProfileExperienceRemoved({ index }))], ["Remove"]),
    ],
  );

const profileForm = (
  form: ProfileForm,
  saving: Model["profileSaving"],
  capabilities: ReadonlyArray<string>,
  h: HtmlBuilder<Message>,
): Html =>
  h.form(
    [h.Class("profile-form"), h.OnSubmit(ProfileSaveClicked())],
    [
      h.label(
        [],
        [
          "Headline",
          h.input([
            h.Value(form.headline),
            h.OnInput((value) => ProfileHeadlineChanged({ value })),
          ]),
        ],
      ),
      h.label(
        [],
        [
          "Summary",
          h.textarea(
            [h.Rows(4), h.OnInput((value) => ProfileSummaryChanged({ value }))],
            [form.summary],
          ),
        ],
      ),
      h.label(
        [],
        [
          "Location",
          h.input([
            h.Value(form.location),
            h.OnInput((value) => ProfileLocationChanged({ value })),
          ]),
        ],
      ),
      h.label(
        [],
        [
          "Languages",
          h.input([
            h.Value(form.languages),
            h.OnInput((value) => ProfileLanguagesChanged({ value })),
          ]),
        ],
      ),
      h.label(
        [],
        [
          "Skills, one per line",
          h.textarea(
            [h.Rows(4), h.OnInput((value) => ProfileSkillsTextChanged({ value }))],
            [form.skillsText],
          ),
        ],
      ),
      h.label(
        [],
        [
          "Education, one per line",
          h.textarea(
            [h.Rows(3), h.OnInput((value) => ProfileEducationTextChanged({ value }))],
            [form.educationText],
          ),
        ],
      ),
      h.h3([], ["Experience"]),
      h.div(
        [],
        form.experience.map((entry, index) => experienceEntry(index, entry, h)),
      ),
      h.button([h.Type("button"), h.OnClick(ProfileExperienceAdded())], ["Add experience"]),
      h.p(
        [],
        ["Account capabilities: ", capabilities.length === 0 ? "none" : capabilities.join(", ")],
      ),
      saving._tag === "Failed" ? renderProblem(saving.problem, h) : h.empty,
      h.button(
        [h.Type("submit"), h.Disabled(saving._tag === "Pending")],
        [saving._tag === "Pending" ? "Saving…" : "Save profile"],
      ),
    ],
  );

export const profileView = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Class("page")],
    [
      h.h2([], ["Profile"]),
      model.session._tag === "Anonymous"
        ? h.p([], ["Enter a session token above to view and edit your CV."])
        : AsyncData.matchDataSplitEmpty(model.profile, {
            onIdle: () => h.p([], ["Not loaded yet."]),
            onLoading: () => h.p([], ["Loading…"]),
            onFailure: (problem) => renderProblem(problem, h),
            onData: (response) =>
              Option.match(model.profileForm, {
                onNone: () => h.empty,
                onSome: (form) => profileForm(form, model.profileSaving, response.capabilities, h),
              }),
          }),
    ],
  );
