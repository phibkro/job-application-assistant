import * as Schema from "effect/Schema";
import {
  ApplicationMethod,
  ApplicationStatus,
  CustomLabel,
  SystemLabel,
  type SystemLabelName,
} from "./Applications.ts";
import { ApplicationId, CanonicalJobId, CustomLabelId, SavedJobId } from "./Ids.ts";
import { JobSnapshot } from "./Job.ts";

/**
 * Nominal label vocabulary used by Saved presets and projections.
 *
 * The runtime value is a prefixed string so generic `Set` membership compares
 * labels by value. A fresh object per constructor call would compare by
 * reference and make every set-expression atom miss.
 */
declare const savedLabelVocabulary: unique symbol;
export type SavedLabel = string & {
  readonly [savedLabelVocabulary]: "SavedLabel";
};

export const savedSystemLabel = (name: SystemLabelName): SavedLabel =>
  `system:${name}` as SavedLabel;

export const savedCustomLabel = (id: CustomLabelId): SavedLabel => `custom:${id}` as SavedLabel;

export const SavedView = Schema.Literals(["all", "active", "needs-action", "applied", "closed"]);
export type SavedView = typeof SavedView.Type;

export const SavedSort = Schema.Literals(["recently-saved", "deadline-soon", "recently-updated"]);
export type SavedSort = typeof SavedSort.Type;

export const CurrentApplicationSummary = Schema.Struct({
  id: ApplicationId,
  status: ApplicationStatus,
  method: ApplicationMethod,
  applicationUrl: Schema.String,
  createdAt: Schema.String,
  updatedAt: Schema.String,
});
export type CurrentApplicationSummary = typeof CurrentApplicationSummary.Type;

export const SavedItem = Schema.Struct({
  savedJobId: SavedJobId,
  canonicalJobId: CanonicalJobId,
  snapshot: JobSnapshot,
  note: Schema.String,
  systemLabels: Schema.Array(SystemLabel),
  customLabelIds: Schema.Array(CustomLabelId),
  currentApplication: Schema.NullOr(CurrentApplicationSummary),
  priorAttemptCount: Schema.Number,
  savedAt: Schema.String,
  updatedAt: Schema.String,
});
export type SavedItem = typeof SavedItem.Type;

export const SavedPage = Schema.Struct({
  data: Schema.Array(SavedItem),
  meta: Schema.Struct({
    limit: Schema.Number,
    nextCursor: Schema.NullOr(Schema.String),
  }),
});
export type SavedPage = typeof SavedPage.Type;

export { CustomLabel };
