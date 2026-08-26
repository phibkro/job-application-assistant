import { AsyncData } from "foldkit";
import type { HtmlBuilder, Html } from "foldkit/html";
import { defineView } from "foldkit/submodel";
import * as Option from "effect/Option";
import type { DocumentSummary } from "../../../worker/src/Api.ts";
import type { Model } from "./Model.ts";
import * as Message from "./Message.ts";
import {
  button,
  card,
  pageClass,
  renderProblem,
  sectionHeading,
  selectField,
  textareaField,
} from "../view/Shared.ts";

/**
 * The studio view (WS-0018): pick a document kind and an optional saved
 * vacancy to target, generate, then edit each stored document inline — save
 * when dirty, regenerate as a new row, copy to the clipboard, delete with a
 * confirmation. Token styling only; every control is labelled through the
 * shared field helpers so the labelling survives restyling.
 */

export type ViewInputs = Readonly<{ isAuthenticated: boolean }>;

const documents = (model: Model): ReadonlyArray<DocumentSummary> =>
  Option.match(AsyncData.getData(model.documents), {
    onNone: () => [],
    onSome: (page) => [...page.data],
  });

const kindPicker = (model: Model, h: HtmlBuilder<Message.Message>): Html =>
  selectField(
    {
      id: "studio-kind",
      label: "Document kind",
      value: model.kind,
      onChange: (value) => Message.KindChanged({ value: value === "letter" ? "letter" : "cv" }),
      options: [
        { value: "cv", label: "CV" },
        { value: "letter", label: "Covering letter" },
      ],
    },
    h,
  );

const enginePicker = (model: Model, h: HtmlBuilder<Message.Message>): Html =>
  selectField(
    {
      id: "studio-engine",
      label: "Engine",
      value: model.engine,
      onChange: (value) =>
        Message.EngineChanged({ value: value === "model" ? "model" : "template" }),
      options: [
        { value: "template", label: "Template (free)" },
        { value: "model", label: "Model (Premium)" },
      ],
    },
    h,
  );

const targetPicker = (model: Model, h: HtmlBuilder<Message.Message>): Html =>
  selectField(
    {
      id: "studio-target",
      label: "Target vacancy (optional)",
      value: model.target ?? "",
      onChange: (value) => Message.TargetChanged({ value: value === "" ? null : value }),
      options: [
        { value: "", label: "General document" },
        ...model.targets.map((target) => ({ value: target.savedJobId, label: target.title })),
      ],
    },
    h,
  );

const composerCard = (model: Model, h: HtmlBuilder<Message.Message>): Html => {
  const generateProblem = model.generate._tag === "Failed" ? model.generate.problem : undefined;
  return card(
    [
      sectionHeading("Draft a new document", h),
      h.div(
        [h.Class("mt-3 grid gap-3 sm:grid-cols-3")],
        [kindPicker(model, h), enginePicker(model, h), targetPicker(model, h)],
      ),
      h.div(
        [h.Class("mt-4")],
        [
          button(
            {
              label: AsyncData.isPending(model.documents)
                ? "Loading documents…"
                : model.kind === "cv"
                  ? "Generate CV"
                  : "Generate letter",
              onClick: Message.GenerateClicked(),
              isDisabled: model.generate._tag === "Pending" || AsyncData.isPending(model.documents),
            },
            h,
          ),
        ],
      ),
      // The 402 path renders through the shared problem vocabulary, naming
      // the capability the account lacks.
      generateProblem !== undefined
        ? h.div([h.Class("mt-3")], [renderProblem(generateProblem, h)])
        : h.empty,
    ],
    h,
  );
};

const documentCard = (
  model: Model,
  summary: DocumentSummary,
  h: HtmlBuilder<Message.Message>,
): Html => {
  const buffer = model.editors.find((editor) => editor.id === summary.id);
  const content = buffer?.content ?? "";
  const confirming =
    model.deleteConfirm._tag === "Pending" && model.deleteConfirm.documentId === summary.id;
  const kindTag = `${summary.kind}${summary.jobTitle === null ? "-general" : "-targeted"}`;
  return card(
    [
      h.div(
        [
          h.DataAttribute("document-kind", kindTag),
          h.Class("flex flex-wrap items-baseline justify-between gap-2"),
        ],
        [
          h.h3(
            [h.Class("font-semibold text-on-surface")],
            [
              summary.kind === "cv" ? "CV" : "Covering letter",
              summary.jobTitle !== null ? ` — ${summary.jobTitle}` : " (general)",
            ],
          ),
          h.span(
            [h.Class("text-xs text-on-surface-variant")],
            [`${summary.engine} · ${summary.createdAt}`],
          ),
        ],
      ),
      textareaField(
        {
          id: `studio-editor-${summary.id}`,
          label: `Edit ${summary.kind === "cv" ? "CV" : "letter"}${summary.jobTitle !== null ? ` for ${summary.jobTitle}` : ""}`,
          value: content,
          rows: 12,
          onInput: (value) => Message.EditorChanged({ id: summary.id, content: value }),
        },
        h,
      ),
      h.div(
        [h.Class("mt-3 flex flex-wrap gap-2")],
        [
          button(
            {
              label:
                model.save.id === summary.id && model.save.request._tag === "Pending"
                  ? "Saving…"
                  : "Save changes",
              variant: "primary",
              isDisabled: !(buffer?.dirty ?? false),
              onClick: Message.SaveClicked({ id: summary.id }),
            },
            h,
          ),
          button(
            {
              label: model.copiedId === summary.id ? "Copied." : "Copy",
              variant: "secondary",
              onClick: Message.CopyClicked({ id: summary.id, content }),
            },
            h,
          ),
          confirming
            ? h.empty
            : button(
                {
                  label: "Delete",
                  variant: "secondary",
                  isDisabled: model.remove._tag === "Pending",
                  onClick: Message.DeleteStarted({ id: summary.id }),
                },
                h,
              ),
        ],
      ),
      confirming
        ? h.div(
            [h.Class("mt-2 flex flex-wrap items-center gap-2")],
            [
              h.p([h.Class("text-sm text-on-surface-variant")], ["Delete this document?"]),
              button(
                {
                  label: "Confirm delete",
                  variant: "primary",
                  onClick: Message.DeleteConfirmed(),
                },
                h,
              ),
              button({ label: "Cancel", variant: "ghost", onClick: Message.DeleteCancelled() }, h),
            ],
          )
        : h.empty,
    ],
    h,
    "document-card",
  );
};

export const view = defineView<Model, Message.Message, ViewInputs>(
  (model, { isAuthenticated }, h) => {
    const list = documents(model);
    const removeProblem = model.remove._tag === "Failed" ? model.remove.problem : undefined;
    return h.div(
      [h.Class(pageClass)],
      [
        h.div(
          [h.Class("space-y-1")],
          [
            sectionHeading("Studio", h),
            h.p(
              [h.Class("text-sm text-on-surface-variant")],
              [
                "Draft, edit, and keep CVs and covering letters — general, or targeted at a saved vacancy's frozen advert.",
              ],
            ),
          ],
        ),
        !isAuthenticated
          ? card(
              [
                h.p([h.Class("font-semibold text-on-surface")], ["Sign in to open Studio."]),
                h.p(
                  [h.Class("mt-1 text-sm text-on-surface-variant")],
                  ["Enter a session token above to draft your own documents."],
                ),
              ],
              h,
            )
          : h.div(
              [h.Class("space-y-6")],
              [
                composerCard(model, h),
                AsyncData.isPending(model.documents) && list.length === 0
                  ? card(
                      [h.p([h.Class("text-sm text-on-surface-variant")], ["Loading documents…"])],
                      h,
                    )
                  : list.length === 0
                    ? card(
                        [
                          h.p(
                            [h.Class("text-sm text-on-surface-variant")],
                            ["No documents yet. Draft one above."],
                          ),
                        ],
                        h,
                      )
                    : h.section(
                        [h.Class("space-y-4")],
                        list.map((summary) => documentCard(model, summary, h)),
                      ),
                model.copiedId !== null
                  ? h.p(
                      [h.Role("status"), h.Class("text-sm text-on-surface-variant")],
                      ["Copied to clipboard."],
                    )
                  : h.empty,
                removeProblem !== undefined
                  ? h.div([], [renderProblem(removeProblem, h)])
                  : h.empty,
              ],
            ),
      ],
    );
  },
);
