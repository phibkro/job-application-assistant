import * as Match from "effect/Match";
import * as Option from "effect/Option";
import { AsyncData } from "foldkit";
import type { Update } from "foldkit";
import { evo } from "foldkit/struct";
import * as Commands from "../Commands.ts";
import {
  RequestFailed,
  RequestIdle,
  RequestPending,
  type RequestStatus,
} from "../RequestStatus.ts";
import { settle } from "../Settle.ts";
import type * as Message from "./Message.ts";
import {
  LabelManagerDeleting,
  LabelManagerIdle,
  LabelManagerRenaming,
  SavedApplicationHistoryAsyncData,
  type Filters,
  type Model,
} from "./Model.ts";

export type UpdateReturn = Update.Return<Model, Message.Message>;
const withReturnType = Match.withReturnType<UpdateReturn>();

const fetchSaved = (model: Model, cursor: Option.Option<string>, append: boolean) =>
  Commands.FetchSaved({
    view: model.filters.view,
    label: Option.fromNullOr(model.filters.customLabelId),
    sort: model.filters.sort,
    cursor,
    append,
  });

const itemRequestsPending = (model: Model): boolean =>
  model.itemRequests.some(
    (request) =>
      request.labels._tag === "Pending" ||
      request.application._tag === "Pending" ||
      AsyncData.isPending(request.history),
  );

const filtersLocked = (model: Model): boolean =>
  AsyncData.isPending(model.saved) ||
  model.createLabel._tag === "Pending" ||
  model.loadMore._tag === "Pending" ||
  itemRequestsPending(model) ||
  model.labelManager._tag !== "Idle";

const setItemRequest = (
  model: Model,
  savedJobId: string,
  key: "labels" | "application",
  status: RequestStatus,
): Model =>
  evo(model, {
    itemRequests: (requests) => {
      const existing = requests.find((request) => request.savedJobId === savedJobId);
      if (existing === undefined) {
        return [
          ...requests,
          {
            savedJobId,
            labels: key === "labels" ? status : RequestIdle(),
            application: key === "application" ? status : RequestIdle(),
            history: SavedApplicationHistoryAsyncData.Idle(),
          },
        ];
      }
      return requests.map((request) =>
        request.savedJobId === savedJobId ? { ...request, [key]: status } : request,
      );
    },
  });

const setItemHistory = (
  model: Model,
  savedJobId: string,
  history: Model["itemRequests"][number]["history"],
): Model =>
  evo(model, {
    itemRequests: (requests) => {
      const existing = requests.find((request) => request.savedJobId === savedJobId);
      if (existing === undefined) {
        return [
          ...requests,
          {
            savedJobId,
            labels: RequestIdle(),
            application: RequestIdle(),
            history,
          },
        ];
      }
      return requests.map((request) =>
        request.savedJobId === savedJobId ? { ...request, history } : request,
      );
    },
  });

const reloadWithFilters = (model: Model, filters: Filters): UpdateReturn => {
  const next = evo(model, {
    filters: () => filters,
    saved: () => AsyncData.Loading(),
    loadMore: () => RequestIdle(),
    itemRequests: () => [],
  });
  return [next, [fetchSaved(next, Option.none(), false)]];
};

export const update = (model: Model, message: Message.Message): UpdateReturn =>
  Match.value(message).pipe(
    withReturnType,
    Match.tagsExhaustive({
      Requested: () => {
        if (
          itemRequestsPending(model) ||
          model.createLabel._tag === "Pending" ||
          model.labelManager._tag !== "Idle"
        ) {
          return [model, []];
        }
        const savedTransition = AsyncData.revalidateOrLoad(model.saved);
        const labelsTransition = AsyncData.revalidateOrLoad(model.labels);
        const commands = [
          ...(Option.isSome(savedTransition) ? [fetchSaved(model, Option.none(), false)] : []),
          ...(Option.isSome(labelsTransition) ? [Commands.FetchSavedLabels()] : []),
        ];
        return [
          evo(model, {
            saved: () => Option.getOrElse(savedTransition, () => model.saved),
            labels: () => Option.getOrElse(labelsTransition, () => model.labels),
          }),
          commands,
        ];
      },
      Invalidated: () => [
        evo(model, {
          saved: () => AsyncData.Idle(),
          loadMore: () => RequestIdle(),
          itemRequests: () => [],
        }),
        [],
      ],

      FetchSucceeded: ({ page, append }) => [
        evo(model, {
          saved: (current) =>
            append
              ? Option.match(AsyncData.getData(current), {
                  onNone: () => AsyncData.Success({ data: page }),
                  onSome: (loaded) =>
                    AsyncData.Success({
                      data: {
                        data: [...loaded.data, ...page.data],
                        meta: page.meta,
                      },
                    }),
                })
              : AsyncData.Success({ data: page }),
          loadMore: () => RequestIdle(),
          itemRequests: append
            ? (requests) => requests
            : (requests) =>
                requests
                  .filter((request) =>
                    page.data.some((item) => item.savedJobId === request.savedJobId),
                  )
                  .map((request) => ({
                    savedJobId: request.savedJobId,
                    labels: RequestIdle(),
                    application: RequestIdle(),
                    history: request.history,
                  })),
        }),
        [],
      ],
      FetchFailed: ({ problem, append }) => [
        append
          ? evo(model, { loadMore: () => RequestFailed({ problem }) })
          : evo(model, { saved: (current) => settle(current, problem) }),
        [],
      ],
      LabelsFetchSucceeded: ({ response }) => [
        evo(model, { labels: () => AsyncData.Success({ data: response }) }),
        [],
      ],
      LabelsFetchFailed: ({ problem }) => [
        evo(model, { labels: (current) => settle(current, problem) }),
        [],
      ],

      ViewChanged: ({ value }) =>
        filtersLocked(model) || value === model.filters.view
          ? [model, []]
          : reloadWithFilters(model, { ...model.filters, view: value }),
      LabelFilterChanged: ({ value }) =>
        filtersLocked(model) || value === model.filters.customLabelId
          ? [model, []]
          : reloadWithFilters(model, { ...model.filters, customLabelId: value }),
      SortChanged: ({ value }) =>
        filtersLocked(model) || value === model.filters.sort
          ? [model, []]
          : reloadWithFilters(model, { ...model.filters, sort: value }),
      NextPageRequested: () => {
        if (filtersLocked(model)) return [model, []];
        return Option.match(AsyncData.getData(model.saved), {
          onNone: () => [model, []] as UpdateReturn,
          onSome: (page) =>
            page.meta.nextCursor === null
              ? ([model, []] as UpdateReturn)
              : [
                  evo(model, { loadMore: () => RequestPending() }),
                  [fetchSaved(model, Option.some(page.meta.nextCursor), true)],
                ],
        });
      },

      LabelNameChanged: ({ value }) =>
        model.createLabel._tag === "Pending"
          ? [model, []]
          : [evo(model, { newLabelName: () => value }), []],
      CreateLabelRequested: () => {
        const name = model.newLabelName.trim();
        if (
          name === "" ||
          AsyncData.isPending(model.saved) ||
          model.loadMore._tag === "Pending" ||
          model.createLabel._tag === "Pending" ||
          model.labelManager._tag !== "Idle" ||
          itemRequestsPending(model)
        ) {
          return [model, []];
        }
        return [
          evo(model, { createLabel: () => RequestPending() }),
          [Commands.CreateSavedLabel({ name })],
        ];
      },
      LabelCreated: ({ label }) => [
        evo(model, {
          labels: (current) =>
            AsyncData.map(current, (response) => ({ data: [...response.data, label] })),
          newLabelName: () => "",
          createLabel: () => RequestIdle(),
        }),
        [],
      ],
      CreateLabelFailed: ({ problem }) => [
        evo(model, { createLabel: () => RequestFailed({ problem }) }),
        [],
      ],

      LabelRenameStarted: ({ labelId }) => {
        if (
          AsyncData.isPending(model.saved) ||
          model.loadMore._tag === "Pending" ||
          model.createLabel._tag === "Pending" ||
          model.labelManager._tag !== "Idle" ||
          itemRequestsPending(model)
        ) {
          return [model, []];
        }
        const labels = Option.getOrUndefined(AsyncData.getData(model.labels));
        const label = labels?.data.find((candidate) => candidate.id === labelId);
        return label === undefined
          ? [model, []]
          : [
              evo(model, {
                labelManager: () =>
                  LabelManagerRenaming({
                    labelId,
                    name: label.name,
                    request: RequestIdle(),
                  }),
              }),
              [],
            ];
      },
      LabelRenameNameChanged: ({ value }) =>
        model.labelManager._tag !== "Renaming" || model.labelManager.request._tag === "Pending"
          ? [model, []]
          : [
              evo(model, {
                labelManager: (manager) =>
                  manager._tag === "Renaming"
                    ? LabelManagerRenaming({ ...manager, name: value })
                    : manager,
              }),
              [],
            ],
      LabelRenameCancelled: () =>
        model.labelManager._tag !== "Renaming" || model.labelManager.request._tag === "Pending"
          ? [model, []]
          : [evo(model, { labelManager: () => LabelManagerIdle() }), []],
      RenameLabelRequested: ({ labelId }) => {
        if (
          model.labelManager._tag !== "Renaming" ||
          model.labelManager.labelId !== labelId ||
          model.labelManager.request._tag === "Pending"
        ) {
          return [model, []];
        }
        const name = model.labelManager.name.trim();
        if (name === "") return [model, []];
        const labels = Option.getOrUndefined(AsyncData.getData(model.labels));
        const label = labels?.data.find((candidate) => candidate.id === labelId);
        if (label === undefined) return [model, []];
        if (label.name === name) {
          return [evo(model, { labelManager: () => LabelManagerIdle() }), []];
        }
        return [
          evo(model, {
            labelManager: () =>
              LabelManagerRenaming({
                labelId,
                name,
                request: RequestPending(),
              }),
          }),
          [Commands.RenameSavedLabel({ labelId, name })],
        ];
      },
      LabelRenamed: ({ label }) => [
        evo(model, {
          labels: (current) =>
            AsyncData.map(current, (response) => ({
              data: response.data.map((candidate) =>
                candidate.id === label.id ? label : candidate,
              ),
            })),
          labelManager: (manager) =>
            manager._tag === "Renaming" && manager.labelId === label.id
              ? LabelManagerIdle()
              : manager,
        }),
        [],
      ],
      RenameLabelFailed: ({ labelId, problem }) =>
        model.labelManager._tag !== "Renaming" || model.labelManager.labelId !== labelId
          ? [model, []]
          : [
              evo(model, {
                labelManager: (manager) =>
                  manager._tag === "Renaming"
                    ? LabelManagerRenaming({
                        ...manager,
                        request: RequestFailed({ problem }),
                      })
                    : manager,
              }),
              [],
            ],

      LabelDeleteStarted: ({ labelId }) => {
        if (
          AsyncData.isPending(model.saved) ||
          model.loadMore._tag === "Pending" ||
          model.createLabel._tag === "Pending" ||
          model.labelManager._tag !== "Idle" ||
          itemRequestsPending(model)
        ) {
          return [model, []];
        }
        const labels = Option.getOrUndefined(AsyncData.getData(model.labels));
        return labels?.data.some((label) => label.id === labelId) !== true
          ? [model, []]
          : [
              evo(model, {
                labelManager: () => LabelManagerDeleting({ labelId, request: RequestIdle() }),
              }),
              [],
            ];
      },
      LabelDeleteCancelled: () =>
        model.labelManager._tag !== "Deleting" || model.labelManager.request._tag === "Pending"
          ? [model, []]
          : [evo(model, { labelManager: () => LabelManagerIdle() }), []],
      DeleteLabelRequested: ({ labelId }) => {
        if (
          model.labelManager._tag !== "Deleting" ||
          model.labelManager.labelId !== labelId ||
          model.labelManager.request._tag === "Pending"
        ) {
          return [model, []];
        }
        const labels = Option.getOrUndefined(AsyncData.getData(model.labels));
        if (labels?.data.some((label) => label.id === labelId) !== true) return [model, []];
        return [
          evo(model, {
            labelManager: () =>
              LabelManagerDeleting({
                labelId,
                request: RequestPending(),
              }),
          }),
          [Commands.DeleteSavedLabel({ labelId })],
        ];
      },
      LabelDeleted: ({ labelId }) => {
        const withoutLabel = evo(model, {
          labels: (current) =>
            AsyncData.map(current, (response) => ({
              data: response.data.filter((label) => label.id !== labelId),
            })),
          saved: (current) =>
            AsyncData.map(current, (page) => ({
              ...page,
              data: page.data.map((item) => ({
                ...item,
                customLabelIds: item.customLabelIds.filter((id) => id !== labelId),
              })),
            })),
          labelManager: (manager) =>
            manager._tag === "Deleting" && manager.labelId === labelId
              ? LabelManagerIdle()
              : manager,
        });
        return model.filters.customLabelId === labelId
          ? reloadWithFilters(withoutLabel, {
              ...withoutLabel.filters,
              customLabelId: null,
            })
          : [withoutLabel, []];
      },
      DeleteLabelFailed: ({ labelId, problem }) =>
        model.labelManager._tag !== "Deleting" || model.labelManager.labelId !== labelId
          ? [model, []]
          : [
              evo(model, {
                labelManager: (manager) =>
                  manager._tag === "Deleting"
                    ? LabelManagerDeleting({
                        labelId,
                        request: RequestFailed({ problem }),
                      })
                    : manager,
              }),
              [],
            ],

      LabelAssignmentChanged: ({ savedJobId, labelId, isAssigned }) => {
        if (
          AsyncData.isPending(model.saved) ||
          model.loadMore._tag === "Pending" ||
          model.labelManager._tag !== "Idle"
        ) {
          return [model, []];
        }
        const request = model.itemRequests.find((item) => item.savedJobId === savedJobId);
        if (request?.labels._tag === "Pending") return [model, []];
        const page = Option.getOrUndefined(AsyncData.getData(model.saved));
        const labels = Option.getOrUndefined(AsyncData.getData(model.labels));
        const item = page?.data.find((saved) => saved.savedJobId === savedJobId);
        if (item === undefined || labels?.data.some((label) => label.id === labelId) !== true) {
          return [model, []];
        }
        const labelIds = isAssigned
          ? item.customLabelIds.includes(labelId)
            ? item.customLabelIds
            : [...item.customLabelIds, labelId]
          : item.customLabelIds.filter((id) => id !== labelId);
        return [
          setItemRequest(model, savedJobId, "labels", RequestPending()),
          [Commands.SetSavedLabels({ savedJobId, labelIds })],
        ];
      },
      LabelAssignmentSucceeded: ({ savedJobId, labelIds }) => [
        setItemRequest(
          evo(model, {
            saved: (current) =>
              AsyncData.map(current, (page) => ({
                ...page,
                data: page.data.map((item) =>
                  item.savedJobId === savedJobId ? { ...item, customLabelIds: labelIds } : item,
                ),
              })),
          }),
          savedJobId,
          "labels",
          RequestIdle(),
        ),
        [],
      ],
      LabelAssignmentFailed: ({ savedJobId, problem }) => [
        setItemRequest(model, savedJobId, "labels", RequestFailed({ problem })),
        [],
      ],

      ApplicationEventRequested: ({ savedJobId, applicationId, event, expectedUpdatedAt }) => {
        const request = model.itemRequests.find((item) => item.savedJobId === savedJobId);
        if (
          AsyncData.isPending(model.saved) ||
          model.loadMore._tag === "Pending" ||
          request?.application._tag === "Pending" ||
          (request !== undefined && AsyncData.isPending(request.history))
        ) {
          return [model, []];
        }
        const page = Option.getOrUndefined(AsyncData.getData(model.saved));
        const current = page?.data.find(
          (item) => item.savedJobId === savedJobId,
        )?.currentApplication;
        if (
          current === null ||
          current === undefined ||
          current.id !== applicationId ||
          current.updatedAt !== expectedUpdatedAt
        ) {
          return [model, []];
        }
        return [
          setItemRequest(model, savedJobId, "application", RequestPending()),
          [Commands.AddApplicationEvent({ savedJobId, applicationId, event, expectedUpdatedAt })],
        ];
      },
      ApplicationEventSucceeded: ({ savedJobId, response }) => {
        const patched = AsyncData.map(model.saved, (page) => ({
          ...page,
          data: page.data.map((item) =>
            item.savedJobId === savedJobId && item.currentApplication?.id === response.applicationId
              ? {
                  ...item,
                  currentApplication: {
                    ...item.currentApplication,
                    status: response.status,
                    updatedAt: response.updatedAt,
                  },
                }
              : item,
          ),
        }));
        const refreshing = Option.getOrElse(AsyncData.revalidate(patched), () => patched);
        return [
          setItemRequest(
            evo(model, {
              saved: () => refreshing,
              itemRequests: (requests) =>
                requests.map((request) =>
                  request.savedJobId !== savedJobId
                    ? request
                    : {
                        ...request,
                        history: AsyncData.map(request.history, (history) => ({
                          data: history.data.map((entry) =>
                            entry.applicationId === response.applicationId
                              ? {
                                  ...entry,
                                  status: response.status,
                                  updatedAt: response.updatedAt,
                                }
                              : entry,
                          ),
                        })),
                      },
                ),
            }),
            savedJobId,
            "application",
            RequestIdle(),
          ),
          [fetchSaved(model, Option.none(), false)],
        ];
      },
      ApplicationEventFailed: ({ savedJobId, problem }) => [
        setItemRequest(model, savedJobId, "application", RequestFailed({ problem })),
        [],
      ],

      ApplicationHistoryRequested: ({ savedJobId }) => {
        if (AsyncData.isPending(model.saved) || model.loadMore._tag === "Pending") {
          return [model, []];
        }
        const page = Option.getOrUndefined(AsyncData.getData(model.saved));
        if (page?.data.some((item) => item.savedJobId === savedJobId) !== true) {
          return [model, []];
        }
        const request = model.itemRequests.find((item) => item.savedJobId === savedJobId);
        if (request?.application._tag === "Pending") return [model, []];
        const current = request?.history ?? SavedApplicationHistoryAsyncData.Idle();
        if (AsyncData.isPending(current) || AsyncData.hasData(current)) return [model, []];
        return [
          setItemHistory(model, savedJobId, SavedApplicationHistoryAsyncData.Loading()),
          [Commands.FetchSavedApplicationHistory({ savedJobId })],
        ];
      },
      ApplicationHistorySucceeded: ({ savedJobId, response }) => [
        setItemHistory(
          model,
          savedJobId,
          SavedApplicationHistoryAsyncData.Success({ data: response }),
        ),
        [],
      ],
      ApplicationHistoryFailed: ({ savedJobId, problem }) => {
        const current =
          model.itemRequests.find((request) => request.savedJobId === savedJobId)?.history ??
          SavedApplicationHistoryAsyncData.Idle();
        return [setItemHistory(model, savedJobId, settle(current, problem)), []];
      },
    }),
  );
