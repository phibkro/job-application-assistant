import * as S from "effect/Schema";
import { AsyncData } from "foldkit";
import { ts } from "foldkit/schema";
import {
  SavedApplicationHistoryResponse,
  SavedPage,
  SavedSort,
  SavedView,
} from "../../../worker/src/Api.ts";
import { CustomLabelId } from "@job-index/domain/Ids";
import { Problem, RequestIdle, RequestStatus } from "../RequestStatus.ts";

export const CustomLabel = S.Struct({
  id: CustomLabelId,
  name: S.String,
  normalizedName: S.String,
  createdAt: S.String,
  updatedAt: S.String,
});
export type CustomLabel = typeof CustomLabel.Type;
export const CustomLabelsResponse = S.Struct({ data: S.Array(CustomLabel) });
export type CustomLabelsResponse = typeof CustomLabelsResponse.Type;

export const LabelManagerIdle = ts("Idle", {});
export const LabelManagerRenaming = ts("Renaming", {
  labelId: CustomLabelId,
  name: S.String,
  request: RequestStatus,
});
export const LabelManagerDeleting = ts("Deleting", {
  labelId: CustomLabelId,
  request: RequestStatus,
});
export const LabelManager = S.Union([LabelManagerIdle, LabelManagerRenaming, LabelManagerDeleting]);
export type LabelManager = typeof LabelManager.Type;

export const SavedAsyncData = AsyncData.Schema(SavedPage, Problem);
export const CustomLabelsAsyncData = AsyncData.Schema(CustomLabelsResponse, Problem);
export const SavedApplicationHistoryAsyncData = AsyncData.Schema(
  SavedApplicationHistoryResponse,
  Problem,
);

export const Filters = S.Struct({
  view: SavedView,
  customLabelId: S.NullOr(CustomLabelId),
  sort: SavedSort,
});
export type Filters = typeof Filters.Type;

export const ItemRequests = S.Struct({
  savedJobId: S.String,
  labels: RequestStatus,
  application: RequestStatus,
  history: SavedApplicationHistoryAsyncData.schema,
});
export type ItemRequests = typeof ItemRequests.Type;

export const Model = S.Struct({
  saved: SavedAsyncData.schema,
  labels: CustomLabelsAsyncData.schema,
  filters: Filters,
  newLabelName: S.String,
  createLabel: RequestStatus,
  labelManager: LabelManager,
  loadMore: RequestStatus,
  itemRequests: S.Array(ItemRequests),
});
export type Model = typeof Model.Type;

export const init = (): Model => ({
  saved: SavedAsyncData.Idle(),
  labels: CustomLabelsAsyncData.Idle(),
  filters: {
    view: "all",
    customLabelId: null,
    sort: "recently-saved",
  },
  newLabelName: "",
  createLabel: RequestIdle(),
  labelManager: LabelManagerIdle(),
  loadMore: RequestIdle(),
  itemRequests: [],
});
