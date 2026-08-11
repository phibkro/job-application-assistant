import * as S from "effect/Schema";
import { m } from "foldkit/message";
import {
  ApplicationEvent,
  ApplicationEventResponse,
  SavedPage,
  SavedSort,
  SavedApplicationHistoryResponse,
  SavedView,
} from "../../../worker/src/Api.ts";
import { CustomLabelId } from "@job-index/domain/Ids";
import { CustomLabel, CustomLabelsResponse } from "./Model.ts";
import { Problem } from "../RequestStatus.ts";

export const Requested = m("Requested");
export const Invalidated = m("Invalidated");
export const FetchSucceeded = m("FetchSucceeded", { page: SavedPage, append: S.Boolean });
export const FetchFailed = m("FetchFailed", { problem: Problem, append: S.Boolean });
export const LabelsFetchSucceeded = m("LabelsFetchSucceeded", {
  response: CustomLabelsResponse,
});
export const LabelsFetchFailed = m("LabelsFetchFailed", { problem: Problem });

export const ViewChanged = m("ViewChanged", { value: SavedView });
export const LabelFilterChanged = m("LabelFilterChanged", {
  value: S.NullOr(CustomLabelId),
});
export const SortChanged = m("SortChanged", { value: SavedSort });
export const NextPageRequested = m("NextPageRequested");

export const LabelNameChanged = m("LabelNameChanged", { value: S.String });
export const CreateLabelRequested = m("CreateLabelRequested");
export const LabelCreated = m("LabelCreated", { label: CustomLabel });
export const CreateLabelFailed = m("CreateLabelFailed", { problem: Problem });

export const LabelRenameStarted = m("LabelRenameStarted", { labelId: CustomLabelId });
export const LabelRenameNameChanged = m("LabelRenameNameChanged", { value: S.String });
export const LabelRenameCancelled = m("LabelRenameCancelled");
export const RenameLabelRequested = m("RenameLabelRequested", { labelId: CustomLabelId });
export const LabelRenamed = m("LabelRenamed", { label: CustomLabel });
export const RenameLabelFailed = m("RenameLabelFailed", {
  labelId: CustomLabelId,
  problem: Problem,
});

export const LabelDeleteStarted = m("LabelDeleteStarted", { labelId: CustomLabelId });
export const LabelDeleteCancelled = m("LabelDeleteCancelled");
export const DeleteLabelRequested = m("DeleteLabelRequested", { labelId: CustomLabelId });
export const LabelDeleted = m("LabelDeleted", { labelId: CustomLabelId });
export const DeleteLabelFailed = m("DeleteLabelFailed", {
  labelId: CustomLabelId,
  problem: Problem,
});

export const LabelAssignmentChanged = m("LabelAssignmentChanged", {
  savedJobId: S.String,
  labelId: CustomLabelId,
  isAssigned: S.Boolean,
});
export const LabelAssignmentSucceeded = m("LabelAssignmentSucceeded", {
  savedJobId: S.String,
  labelIds: S.Array(CustomLabelId),
});
export const LabelAssignmentFailed = m("LabelAssignmentFailed", {
  savedJobId: S.String,
  problem: Problem,
});

export const ApplicationEventRequested = m("ApplicationEventRequested", {
  savedJobId: S.String,
  applicationId: S.String,
  event: ApplicationEvent,
  expectedUpdatedAt: S.String,
});
export const ApplicationEventSucceeded = m("ApplicationEventSucceeded", {
  savedJobId: S.String,
  response: ApplicationEventResponse,
});
export const ApplicationEventFailed = m("ApplicationEventFailed", {
  savedJobId: S.String,
  problem: Problem,
});

export const ApplicationHistoryRequested = m("ApplicationHistoryRequested", {
  savedJobId: S.String,
});
export const ApplicationHistorySucceeded = m("ApplicationHistorySucceeded", {
  savedJobId: S.String,
  response: SavedApplicationHistoryResponse,
});
export const ApplicationHistoryFailed = m("ApplicationHistoryFailed", {
  savedJobId: S.String,
  problem: Problem,
});

export const Message = S.Union([
  Requested,
  Invalidated,
  FetchSucceeded,
  FetchFailed,
  LabelsFetchSucceeded,
  LabelsFetchFailed,
  ViewChanged,
  LabelFilterChanged,
  SortChanged,
  NextPageRequested,
  LabelNameChanged,
  CreateLabelRequested,
  LabelCreated,
  CreateLabelFailed,
  LabelRenameStarted,
  LabelRenameNameChanged,
  LabelRenameCancelled,
  RenameLabelRequested,
  LabelRenamed,
  RenameLabelFailed,
  LabelDeleteStarted,
  LabelDeleteCancelled,
  DeleteLabelRequested,
  LabelDeleted,
  DeleteLabelFailed,
  LabelAssignmentChanged,
  LabelAssignmentSucceeded,
  LabelAssignmentFailed,
  ApplicationEventRequested,
  ApplicationEventSucceeded,
  ApplicationEventFailed,
  ApplicationHistoryRequested,
  ApplicationHistorySucceeded,
  ApplicationHistoryFailed,
]);
export type Message = typeof Message.Type;
