import * as Match from "effect/Match";
import { AsyncData } from "foldkit";
import type { Update } from "foldkit";
import { evo } from "foldkit/struct";
import * as Commands from "../Commands.ts";
import { settle } from "../Settle.ts";
import { RequestFailed, RequestIdle, RequestPending } from "../RequestStatus.ts";
import { DeleteConfirmPending } from "./Model.ts";
import type { Page } from "./Model.ts";
import type * as Message from "./Message.ts";
import { DeleteConfirmIdle, DocumentsAsyncData, type EditorBuffer, type Model } from "./Model.ts";

export type UpdateReturn = Update.Return<Model, Message.Message>;
const withReturnType = Match.withReturnType<UpdateReturn>();

/** The editor buffer for one document, if it has been opened. */
const editorFor = (model: Model, id: string): EditorBuffer | undefined =>
  model.editors.find((buffer) => buffer.id === id);

/** Opens an editor seeded from the composed content; reopening is a no-op. */
const openEditor = (model: Model, id: string, content: string): Array<EditorBuffer> => {
  const existing = editorFor(model, id);
  if (existing !== undefined) return [...model.editors];
  return [...model.editors, { id, content, dirty: false }];
};

export const update = (model: Model, message: Message.Message): UpdateReturn =>
  Match.value(message).pipe(
    withReturnType,
    Match.tagsExhaustive({
      // Entry: load the owner's documents and the target picker's options.
      Requested: () =>
        AsyncData.isIdle(model.documents) || AsyncData.isFailure(model.documents)
          ? [
              evo(model, {
                documents: () => DocumentsAsyncData.Loading(),
                targetsRequest: () => RequestPending(),
              }),
              [Commands.FetchDocuments({}), Commands.FetchDocumentTargets({})],
            ]
          : [model, []],

      KindChanged: ({ value }) => [evo(model, { kind: () => value }), []],
      TargetChanged: ({ value }) => [evo(model, { target: () => value }), []],
      EngineChanged: ({ value }) => [evo(model, { engine: () => value }), []],

      // The fetch command hands back the decoded page; store it as-is. The
      // Message schema carries it as `S.Any` (unknown), so this one cast is
      // the boundary where the Command's typed completion is restored —
      // named const, single site, never raw external input.
      DocumentsReceived: ({ page }) => {
        const decoded = page as Page;
        return [evo(model, { documents: () => AsyncData.Success({ data: decoded }) }), []];
      },
      DocumentsFetchFailed: ({ problem }) => [
        evo(model, { documents: (current) => settle(current, problem) }),
        [],
      ],

      GenerateClicked: () => [
        evo(model, { generate: () => RequestPending() }),
        [
          Commands.CreateDocument({
            kind: model.kind,
            engine: model.engine,
            jobId: model.target,
          }),
        ],
      ],

      GenerateSucceeded: ({ response }) => {
        const created = response.data;
        return [
          evo(model, {
            generate: () => RequestIdle(),
            documents: () => DocumentsAsyncData.Idle(),
            editors: () => openEditor(model, created.id, created.content),
            copiedId: () => null,
          }),
          // Reload the owner's list so the new row appears; the editor for
          // it is already open above, so no second composition happens.
          [Commands.FetchDocuments({})],
        ];
      },

      GenerateFailed: ({ problem }) => [
        evo(model, { generate: () => RequestFailed({ problem }) }),
        [],
      ],

      EditorChanged: ({ id, content }) => [
        evo(model, {
          editors: (buffers) =>
            buffers.map((buffer) =>
              buffer.id === id ? { ...buffer, content, dirty: true } : buffer,
            ),
        }),
        [],
      ],

      SaveClicked: ({ id }) => {
        const buffer = editorFor(model, id);
        if (buffer === undefined || !buffer.dirty) return [model, []];
        return [
          evo(model, {
            save: (current) => ({ ...current, id, request: RequestPending() }),
          }),
          [Commands.SaveDocumentContent({ id, content: buffer.content })],
        ];
      },

      SaveSucceeded: ({ document }) => [
        evo(model, {
          save: (current) => ({ ...current, request: RequestIdle() }),
          editors: (buffers) =>
            buffers.map((buffer) =>
              buffer.id === document.id
                ? { ...buffer, content: document.content, dirty: false }
                : buffer,
            ),
        }),
        [],
      ],

      SaveFailed: ({ id, problem }) => [
        evo(model, {
          save: (current) => ({ ...current, id, request: RequestFailed({ problem }) }),
        }),
        [],
      ],

      // Two-step delete: arm the confirmation, then fire on Confirm.
      DeleteStarted: ({ id }) => [
        evo(model, { deleteConfirm: () => DeleteConfirmPending({ documentId: id }) }),
        [],
      ],
      DeleteCancelled: () => [evo(model, { deleteConfirm: () => DeleteConfirmIdle() }), []],
      DeleteConfirmed: () => {
        if (model.deleteConfirm._tag !== "Pending") return [model, []];
        const id = model.deleteConfirm.documentId;
        return [evo(model, { remove: () => RequestPending() }), [Commands.DeleteDocument({ id })]];
      },

      DeleteSucceeded: ({ id }) => [
        evo(model, {
          remove: () => RequestIdle(),
          deleteConfirm: () => DeleteConfirmIdle(),
          documents: () => DocumentsAsyncData.Idle(),
          editors: (buffers) => buffers.filter((buffer) => buffer.id !== id),
          copiedId: () => null,
        }),
        // Reload through the idle state so the next visit refetches.
        [Commands.FetchDocuments({})],
      ],

      DeleteFailed: ({ problem }) => [
        evo(model, {
          remove: () => RequestFailed({ problem }),
          deleteConfirm: () => DeleteConfirmIdle(),
        }),
        [],
      ],

      CopyClicked: ({ id, content }) => [model, [Commands.CopyDocumentText({ id, content })]],
      CopySucceeded: ({ id }) => [evo(model, { copiedId: () => id }), []],
      CopyFailed: () => [evo(model, { copiedId: () => null }), []],

      TargetsFetchSucceeded: ({ targets }) => [
        evo(model, { targets: () => [...targets], targetsRequest: () => RequestIdle() }),
        [],
      ],

      Invalidate: () => [
        evo(model, {
          documents: () => DocumentsAsyncData.Idle(),
          editors: () => [],
          deleteConfirm: () => DeleteConfirmIdle(),
        }),
        [],
      ],
    }),
  );
