import * as S from "effect/Schema";
import { AsyncData } from "foldkit";
import { ts } from "foldkit/schema";
import { DocumentKind, CompositionEngine } from "@job-index/domain/Documents";
import { DocumentsPage } from "../../../worker/src/Api.ts";
import type { DocumentSummary } from "../../../worker/src/Api.ts";
import { Problem, RequestIdle, RequestStatus } from "../RequestStatus.ts";

/**
 * The list payload schema is the Api declaration itself (the `SavedPage`
 * single-declaration rule) — decoded once here, never re-declared.
 */
export const DocumentsAsyncData = AsyncData.Schema(DocumentsPage, Problem);

/** One saved vacancy the owner may target — projected from the Saved list. */
export const DocumentTarget = S.Struct({
  savedJobId: S.String,
  title: S.String,
});
export type DocumentTarget = typeof DocumentTarget.Type;

/**
 * The editor buffer for one open document: what the textarea holds and
 * whether it has drifted from the stored copy (Save arms only when dirty).
 */
export const EditorBuffer = S.Struct({
  id: S.String,
  content: S.String,
  dirty: S.Boolean,
});
export type EditorBuffer = typeof EditorBuffer.Type;

export const DeleteConfirmPending = ts("Pending", { documentId: S.String });
export const DeleteConfirmIdle = ts("Idle", {});
export const DeleteConfirmState = S.Union([DeleteConfirmIdle, DeleteConfirmPending]);
export type DeleteConfirmState = typeof DeleteConfirmState.Type;

export type Summary = typeof DocumentSummary.Type;
export type Page = typeof DocumentsPage.Type;

export const Model = S.Struct({
  documents: DocumentsAsyncData.schema,
  /** The composer form: which kind, targeted at which job (null = general). */
  kind: DocumentKind,
  target: S.NullOr(S.String),
  engine: CompositionEngine,
  targets: S.Array(DocumentTarget),
  targetsRequest: RequestStatus,
  generate: RequestStatus,
  /** One buffer per opened document, keyed by id. */
  editors: S.Array(EditorBuffer),
  save: S.Struct({ id: S.String, request: RequestStatus }),
  deleteConfirm: DeleteConfirmState,
  remove: RequestStatus,
  /** The id whose Copy button last reported success, for transient feedback. */
  copiedId: S.NullOr(S.String),
});
export type Model = typeof Model.Type;

export const init = (): Model => ({
  documents: DocumentsAsyncData.Idle(),
  kind: "cv",
  target: null,
  engine: "template",
  targets: [],
  targetsRequest: RequestIdle(),
  generate: RequestIdle(),
  editors: [],
  save: { id: "", request: RequestIdle() },
  deleteConfirm: DeleteConfirmIdle(),
  remove: RequestIdle(),
  copiedId: null,
});
