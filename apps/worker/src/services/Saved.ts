import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { CustomLabel } from "@job-index/domain/Applications";
import type { SavedPage, SavedSort, SavedView } from "@job-index/domain/Saved";
import type { CustomLabelId, ProfileId, SavedJobId } from "@job-index/domain/Ids";
import type {
  CustomLabelMissing,
  LabelNameConflict,
  ReservedLabelMutation,
  SavedJobMissing,
} from "@job-index/domain/Failure";

export interface SavedQuery {
  readonly view: SavedView;
  readonly label?: CustomLabelId;
  readonly sort: SavedSort;
  readonly cursor?: string;
}

export class Saved extends Context.Service<
  Saved,
  {
    readonly list: (profile: ProfileId, query: SavedQuery) => Effect.Effect<SavedPage>;
    readonly labels: (profile: ProfileId) => Effect.Effect<ReadonlyArray<CustomLabel>>;
    readonly createLabel: (
      profile: ProfileId,
      name: string,
    ) => Effect.Effect<CustomLabel, LabelNameConflict | ReservedLabelMutation>;
    readonly renameLabel: (
      profile: ProfileId,
      label: CustomLabelId,
      name: string,
    ) => Effect.Effect<CustomLabel, CustomLabelMissing | LabelNameConflict | ReservedLabelMutation>;
    readonly deleteLabel: (
      profile: ProfileId,
      label: CustomLabelId,
    ) => Effect.Effect<void, CustomLabelMissing>;
    readonly setLabels: (
      profile: ProfileId,
      savedJob: SavedJobId,
      labels: ReadonlyArray<CustomLabelId>,
    ) => Effect.Effect<void, SavedJobMissing | CustomLabelMissing | ReservedLabelMutation>;
  }
>()("@job-index/Saved") {}
