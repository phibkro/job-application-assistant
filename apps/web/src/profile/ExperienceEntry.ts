import * as Match from "effect/Match";
import * as Option from "effect/Option";
import * as S from "effect/Schema";
import { m } from "foldkit/message";
import type { Update } from "foldkit";
import { evo } from "foldkit/struct";
import { defineView } from "foldkit/submodel";
import { Fieldset } from "@foldkit/ui";
import type { Experience } from "@job-index/domain/Profile";
import { linesOf } from "./textList.ts";
import { button, inputField, textareaField } from "../view/Shared.ts";

/**
 * One experience entry, edited as its own Submodel rather than one array
 * slot the parent form reaches into by index. `id` is what makes that
 * possible: `SubmodelConfig`'s `slotId` must be a stable per-item
 * identifier, not the array index — an index shifts under insert/remove,
 * which would make Foldkit's boundary registry address the wrong entry's
 * in-flight edits the moment a sibling above it is removed. `id` exists
 * only to key this Submodel; it never crosses into the domain `Experience`
 * the profile is saved as (see `toExperience`).
 */
export const Model = S.Struct({
  id: S.String,
  title: S.String,
  employer: S.String,
  period: S.String,
  /** Newline-separated in the form, split into `highlights` on save. */
  highlightsText: S.String,
});
export type Model = typeof Model.Type;

export const init = (): Model => ({
  id: crypto.randomUUID(),
  title: "",
  employer: "",
  period: "",
  highlightsText: "",
});

/** The only two functions that cross between the domain `Experience` (one
 *  array of highlight strings) and this form (one textarea, newline
 *  separated) — the entry-level counterpart to `ProfileFormCodec`'s split at
 *  the profile level. `id` is supplied by the caller (fresh per fetch) since
 *  the domain type carries none. */
export const fromExperience = (id: string, entry: Experience): Model => ({
  id,
  title: entry.title,
  employer: entry.employer,
  period: entry.period,
  highlightsText: entry.highlights.join("\n"),
});

export const toExperience = (model: Model): Experience => ({
  title: model.title,
  employer: model.employer,
  period: model.period,
  highlights: linesOf(model.highlightsText),
});

export const TitleChanged = m("TitleChanged", { value: S.String });
export const EmployerChanged = m("EmployerChanged", { value: S.String });
export const PeriodChanged = m("PeriodChanged", { value: S.String });
export const HighlightsTextChanged = m("HighlightsTextChanged", { value: S.String });
export const RemoveClicked = m("RemoveClicked");
export const Message = S.Union([
  TitleChanged,
  EmployerChanged,
  PeriodChanged,
  HighlightsTextChanged,
  RemoveClicked,
]);
export type Message = typeof Message.Type;

/** Sent to the parent when this entry's "Remove" button is clicked. The
 *  entry cannot remove itself from an array it does not hold a reference to
 *  — only the parent, which owns the list, can act on it. */
export const Removed = m("Removed");
export const OutMessage = S.Union([Removed]);
export type OutMessage = typeof OutMessage.Type;

export type UpdateReturn = Update.ReturnWithOutMessage<Model, Message, OutMessage>;
const withReturnType = Match.withReturnType<UpdateReturn>();

export const update = (model: Model, message: Message): UpdateReturn =>
  Match.value(message).pipe(
    withReturnType,
    Match.tagsExhaustive({
      TitleChanged: ({ value }) => [evo(model, { title: () => value }), [], Option.none()],
      EmployerChanged: ({ value }) => [evo(model, { employer: () => value }), [], Option.none()],
      PeriodChanged: ({ value }) => [evo(model, { period: () => value }), [], Option.none()],
      HighlightsTextChanged: ({ value }) => [
        evo(model, { highlightsText: () => value }),
        [],
        Option.none(),
      ],
      RemoveClicked: () => [model, [], Option.some(Removed())],
    }),
  );

/** Ancestor-owned display data this entry does not hold: its position in
 *  the list. Position shifts whenever a sibling above it is added or
 *  removed, so it is not this entry's own state — it travels through
 *  `viewInputs`, the read-only per-render channel `h.submodel` supplies for
 *  exactly this shape of data, rather than living in `Model` where it would
 *  need updating on every sibling edit. */
export type ViewInputs = Readonly<{ position: number }>;

export const view = defineView<Model, Message, ViewInputs>((model, { position }, h) => {
  const id = `experience-${model.id}`;
  return Fieldset.view(
    {
      id,
      toView: (attributes) =>
        h.fieldset(
          [...attributes.fieldset, h.Class("space-y-3 rounded-lg border border-gray-200 p-4")],
          [
            h.legend(
              [...attributes.legend, h.Class("px-1 text-sm font-semibold text-gray-900")],
              [`Experience ${position}`],
            ),
            inputField(
              {
                id: `${id}-title`,
                label: "Title",
                value: model.title,
                onInput: (value) => TitleChanged({ value }),
              },
              h,
            ),
            inputField(
              {
                id: `${id}-employer`,
                label: "Employer",
                value: model.employer,
                onInput: (value) => EmployerChanged({ value }),
              },
              h,
            ),
            inputField(
              {
                id: `${id}-period`,
                label: "Period",
                value: model.period,
                onInput: (value) => PeriodChanged({ value }),
              },
              h,
            ),
            textareaField(
              {
                id: `${id}-highlights`,
                label: "Highlights, one per line",
                value: model.highlightsText,
                rows: 3,
                onInput: (value) => HighlightsTextChanged({ value }),
              },
              h,
            ),
            button(
              { label: "Remove", type: "button", variant: "ghost", onClick: RemoveClicked() },
              h,
            ),
          ],
        ),
    },
    h,
  );
});
