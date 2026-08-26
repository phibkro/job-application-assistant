import * as S from "effect/Schema";
import { m } from "foldkit/message";
import type { DocumentCreateResponse, DocumentView } from "../../../worker/src/Api.ts";
import { DocumentTarget } from "./Model.ts";
import { Problem } from "../RequestStatus.ts";

/**
 * The studio cluster's Message vocabulary. Prefix-free naming within the
 * cluster (the `saved/` convention); the root forwards through
 * `GotStudioMessage` with the session epoch attached.
 *
 * Completion payloads that mirror Api response shapes travel typed
 * (`DocumentCreateResponse` / `DocumentView`), so the update arms never
 * re-decode by hand.
 */

export const Requested = m("Requested");

export const KindChanged = m("KindChanged", { value: S.Literals(["cv", "letter"]) });
export const TargetChanged = m("TargetChanged", { value: S.NullOr(S.String) });
export const EngineChanged = m("EngineChanged", {
  value: S.Literals(["template", "model"]),
});

/** The full documents list after a fetch — replaces the AsyncData payload. */
export const DocumentsReceived = m("DocumentsReceived", {
  page: S.Any as S.Schema<unknown>,
});
export const DocumentsFetchFailed = m("DocumentsFetchFailed", { problem: Problem });

export const GenerateClicked = m("GenerateClicked");
export const GenerateSucceeded = m("GenerateSucceeded", {
  response: S.Any as S.Schema<DocumentCreateResponse>,
});
export const GenerateFailed = m("GenerateFailed", { problem: Problem });

export const EditorChanged = m("EditorChanged", { id: S.String, content: S.String });
export const SaveClicked = m("SaveClicked", { id: S.String });
export const SaveSucceeded = m("SaveSucceeded", { document: S.Any as S.Schema<DocumentView> });
export const SaveFailed = m("SaveFailed", { id: S.String, problem: Problem });

export const DeleteStarted = m("DeleteStarted", { id: S.String });
export const DeleteCancelled = m("DeleteCancelled");
export const DeleteConfirmed = m("DeleteConfirmed");
export const DeleteSucceeded = m("DeleteSucceeded", { id: S.String });
export const DeleteFailed = m("DeleteFailed", { problem: Problem });

export const CopyClicked = m("CopyClicked", { id: S.String, content: S.String });
export const CopySucceeded = m("CopySucceeded", { id: S.String });
export const CopyFailed = m("CopyFailed", { problem: Problem });

export const TargetsFetchSucceeded = m("TargetsFetchSucceeded", {
  targets: S.Array(DocumentTarget),
});

export const Invalidate = m("Invalidate");

export const Message = S.Union([
  Requested,
  KindChanged,
  TargetChanged,
  EngineChanged,
  DocumentsReceived,
  DocumentsFetchFailed,
  GenerateClicked,
  GenerateSucceeded,
  GenerateFailed,
  EditorChanged,
  SaveClicked,
  SaveSucceeded,
  SaveFailed,
  DeleteStarted,
  DeleteCancelled,
  DeleteConfirmed,
  DeleteSucceeded,
  DeleteFailed,
  CopyClicked,
  CopySucceeded,
  CopyFailed,
  TargetsFetchSucceeded,
  Invalidate,
]);
export type Message = typeof Message.Type;
