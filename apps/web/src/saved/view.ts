import * as Option from "effect/Option";
import * as S from "effect/Schema";
import { AsyncData } from "foldkit";
import type { Html, HtmlBuilder } from "foldkit/html";
import { defineView } from "foldkit/submodel";
import type {
  ApplicationEvent,
  ApplicationStatus,
  SavedApplicationHistoryEntry,
  SavedItem,
  SavedPage,
  SavedView,
} from "../../../worker/src/Api.ts";
import { CustomLabelId } from "@job-index/domain/Ids";
import * as Route from "../Route.ts";
import type { RequestStatus } from "../RequestStatus.ts";
import {
  button,
  card,
  checkboxField,
  inputField,
  linkButton,
  pageClass,
  renderProblem,
  sectionHeading,
  selectField,
} from "../view/Shared.ts";
import * as Message from "./Message.ts";
import { SavedApplicationHistoryAsyncData, type CustomLabel, type Model } from "./Model.ts";

const presets: ReadonlyArray<Readonly<{ value: SavedView; label: string; description: string }>> = [
  { value: "all", label: "All", description: "Includes every saved vacancy." },
  {
    value: "active",
    label: "Active",
    description: "Excludes vacancies with a warranted closed, expired, or occupied system label.",
  },
  {
    value: "needs-action",
    label: "Needs action",
    description: "Includes vacancies with no current attempt or a current attempt in Ready.",
  },
  {
    value: "applied",
    label: "Applied",
    description: "Includes current attempts in Submitted, Interview, Offer, or Rejected (OR).",
  },
  {
    value: "closed",
    label: "Closed",
    description:
      "Includes vacancies with any warranted closed, expired, or occupied system label (OR).",
  },
];

const idleRequest: RequestStatus = { _tag: "Idle" };
const idleHistory = SavedApplicationHistoryAsyncData.Idle();

const itemRequest = (model: Model, savedJobId: string) =>
  model.itemRequests.find((request) => request.savedJobId === savedJobId);

const filtersLocked = (model: Model): boolean =>
  AsyncData.isPending(model.saved) ||
  model.loadMore._tag === "Pending" ||
  model.createLabel._tag === "Pending" ||
  model.labelManager._tag !== "Idle" ||
  model.itemRequests.some(
    (request) =>
      request.labels._tag === "Pending" ||
      request.application._tag === "Pending" ||
      AsyncData.isPending(request.history),
  );

const statusText = (status: ApplicationStatus): string => {
  switch (status) {
    case "ready":
      return "Ready — external submission not confirmed";
    case "submitted":
      return "Submitted";
    case "interview":
      return "Interview";
    case "offer":
      return "Offer";
    case "rejected":
      return "Rejected";
    case "withdrawn":
      return "Withdrawn";
  }
};

type EventAction = Readonly<{
  event: ApplicationEvent;
  label: string;
  variant?: "primary" | "secondary" | "warning";
}>;

const eventActions = (status: ApplicationStatus): ReadonlyArray<EventAction> => {
  switch (status) {
    case "ready":
      return [
        { event: "confirm-submission", label: "I submitted externally — confirm" },
        { event: "withdraw", label: "Withdraw attempt", variant: "secondary" },
      ];
    case "submitted":
      return [
        { event: "record-interview", label: "Record interview", variant: "secondary" },
        { event: "record-offer", label: "Record offer", variant: "secondary" },
        { event: "record-rejection", label: "Record rejection", variant: "warning" },
        { event: "withdraw", label: "Withdraw", variant: "secondary" },
      ];
    case "interview":
      return [
        { event: "record-offer", label: "Record offer", variant: "secondary" },
        { event: "record-rejection", label: "Record rejection", variant: "warning" },
        { event: "withdraw", label: "Withdraw", variant: "secondary" },
      ];
    case "offer":
    case "rejected":
    case "withdrawn":
      return [];
  }
};

const decodeCustomLabelId = S.decodeUnknownSync(CustomLabelId);

const filtersView = (
  model: Model,
  labels: ReadonlyArray<CustomLabel>,
  h: HtmlBuilder<Message.Message>,
): Html => {
  const disabled = filtersLocked(model);
  const preset = presets.find((candidate) => candidate.value === model.filters.view);
  const selectedLabel = labels.find((label) => label.id === model.filters.customLabelId);
  const labelClause =
    model.filters.customLabelId === null
      ? "Selecting a custom label narrows this preset with AND."
      : `The "${selectedLabel?.name ?? "selected"}" custom label is also required (AND).`;
  return h.section(
    [h.AriaLabelledBy("saved-filters-heading"), h.Class("space-y-4")],
    [
      h.h3(
        [h.Id("saved-filters-heading"), h.Class("text-base font-semibold text-gray-900")],
        ["Filter Saved"],
      ),
      h.fieldset(
        [h.Class("space-y-2")],
        [
          h.legend([h.Class("text-sm font-medium text-gray-700")], ["Saved view"]),
          h.ul(
            [h.Class("flex flex-wrap gap-2")],
            presets.map((candidate) =>
              h.keyed("li")(
                candidate.value,
                [],
                [
                  button(
                    {
                      label: candidate.label,
                      variant: model.filters.view === candidate.value ? "primary" : "secondary",
                      ariaPressed: model.filters.view === candidate.value,
                      ariaDescribedBy: "saved-filter-explanation",
                      isDisabled: disabled,
                      onClick: Message.ViewChanged({ value: candidate.value }),
                    },
                    h,
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
      h.p(
        [h.Id("saved-filter-explanation"), h.Class("text-sm text-gray-600")],
        [`${preset?.description ?? ""} ${labelClause}`],
      ),
      h.div(
        [h.Class("grid gap-3 sm:grid-cols-2")],
        [
          selectField(
            {
              id: "saved-label-filter",
              label: "Custom label",
              value: model.filters.customLabelId ?? "",
              isDisabled: disabled || !AsyncData.hasData(model.labels),
              onChange: (value) =>
                Message.LabelFilterChanged({
                  value: value === "" ? null : decodeCustomLabelId(value),
                }),
              options: [
                { value: "", label: "All custom labels" },
                ...labels.map((label) => ({ value: label.id, label: label.name })),
              ],
            },
            h,
          ),
          selectField(
            {
              id: "saved-sort",
              label: "Sort by",
              value: model.filters.sort,
              isDisabled: disabled,
              onChange: (value) =>
                Message.SortChanged({
                  value:
                    value === "deadline-soon" || value === "recently-updated"
                      ? value
                      : "recently-saved",
                }),
              options: [
                { value: "recently-saved", label: "Recently saved" },
                { value: "deadline-soon", label: "Deadline soon" },
                { value: "recently-updated", label: "Recently updated" },
              ],
            },
            h,
          ),
        ],
      ),
    ],
  );
};

const labelDefinition = (
  model: Model,
  label: CustomLabel,
  h: HtmlBuilder<Message.Message>,
): Html => {
  const manager = model.labelManager;
  const isRenaming = manager._tag === "Renaming" && manager.labelId === label.id;
  const isDeleting = manager._tag === "Deleting" && manager.labelId === label.id;
  const actionsDisabled =
    filtersLocked(model) ||
    model.createLabel._tag === "Pending" ||
    model.labelManager._tag !== "Idle";

  return h.keyed("li")(
    label.id,
    [h.Class("rounded-md border border-gray-200 p-3")],
    [
      isRenaming
        ? h.form(
            [h.Class("space-y-3"), h.OnSubmit(Message.RenameLabelRequested({ labelId: label.id }))],
            [
              inputField(
                {
                  id: `rename-saved-label-${label.id}`,
                  label: `Rename ${label.name}`,
                  value: manager.name,
                  isDisabled: manager.request._tag === "Pending",
                  onInput: (value) => Message.LabelRenameNameChanged({ value }),
                },
                h,
              ),
              h.div(
                [h.Class("flex flex-wrap gap-2")],
                [
                  button(
                    {
                      label: manager.request._tag === "Pending" ? "Saving…" : "Save rename",
                      type: "submit",
                      isDisabled: manager.request._tag === "Pending" || manager.name.trim() === "",
                    },
                    h,
                  ),
                  button(
                    {
                      label: "Cancel",
                      variant: "secondary",
                      isDisabled: manager.request._tag === "Pending",
                      onClick: Message.LabelRenameCancelled(),
                    },
                    h,
                  ),
                ],
              ),
              manager.request._tag === "Failed"
                ? renderProblem(manager.request.problem, h)
                : h.empty,
            ],
          )
        : isDeleting
          ? h.div(
              [h.Class("space-y-3")],
              [
                h.p(
                  [h.Class("text-sm font-semibold text-gray-900")],
                  [`Delete "${label.name}" and remove it from every saved vacancy?`],
                ),
                h.div(
                  [h.Class("flex flex-wrap gap-2")],
                  [
                    button(
                      {
                        label: manager.request._tag === "Pending" ? "Deleting…" : "Delete label",
                        variant: "warning",
                        isDisabled: manager.request._tag === "Pending",
                        onClick: Message.DeleteLabelRequested({ labelId: label.id }),
                      },
                      h,
                    ),
                    button(
                      {
                        label: "Cancel",
                        variant: "secondary",
                        isDisabled: manager.request._tag === "Pending",
                        onClick: Message.LabelDeleteCancelled(),
                      },
                      h,
                    ),
                  ],
                ),
                manager.request._tag === "Pending"
                  ? h.p(
                      [h.Role("status"), h.Class("text-sm text-gray-500")],
                      ["Deleting label and removing assignments…"],
                    )
                  : h.empty,
                manager.request._tag === "Failed"
                  ? renderProblem(manager.request.problem, h)
                  : h.empty,
              ],
            )
          : h.div(
              [h.Class("flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between")],
              [
                h.span([h.Class("font-medium text-gray-900")], [label.name]),
                h.div(
                  [h.Class("flex flex-wrap gap-2")],
                  [
                    button(
                      {
                        label: "Rename",
                        ariaLabel: `Rename ${label.name}`,
                        variant: "secondary",
                        isDisabled: actionsDisabled,
                        onClick: Message.LabelRenameStarted({ labelId: label.id }),
                      },
                      h,
                    ),
                    button(
                      {
                        label: "Delete",
                        ariaLabel: `Delete ${label.name}`,
                        variant: "warning",
                        isDisabled: actionsDisabled,
                        onClick: Message.LabelDeleteStarted({ labelId: label.id }),
                      },
                      h,
                    ),
                  ],
                ),
              ],
            ),
    ],
  );
};

const labelManager = (
  model: Model,
  labels: ReadonlyArray<CustomLabel>,
  h: HtmlBuilder<Message.Message>,
): Html => {
  const managerPending =
    model.labelManager._tag !== "Idle" && model.labelManager.request._tag === "Pending";
  const createDisabled =
    filtersLocked(model) ||
    model.createLabel._tag === "Pending" ||
    !AsyncData.hasData(model.labels);
  return h.section(
    [
      h.AriaLabelledBy("saved-labels-heading"),
      ...(model.createLabel._tag === "Pending" || managerPending ? [h.AriaBusy(true)] : []),
      h.Class("space-y-3"),
    ],
    [
      h.h3(
        [h.Id("saved-labels-heading"), h.Class("text-base font-semibold text-gray-900")],
        ["Custom labels"],
      ),
      h.p(
        [h.Class("text-sm text-gray-600")],
        [
          "Names are unique within your account after case and repeated spaces are normalized. Deleting a label also removes all of its saved-vacancy assignments.",
        ],
      ),
      h.form(
        [
          h.Class("flex flex-col gap-2 sm:flex-row sm:items-end"),
          h.OnSubmit(Message.CreateLabelRequested()),
        ],
        [
          h.div(
            [h.Class("min-w-0 flex-1")],
            [
              inputField(
                {
                  id: "new-saved-label",
                  label: "New custom label",
                  value: model.newLabelName,
                  placeholder: "For example, Follow up",
                  isDisabled: createDisabled,
                  onInput: (value) => Message.LabelNameChanged({ value }),
                },
                h,
              ),
            ],
          ),
          button(
            {
              label: model.createLabel._tag === "Pending" ? "Creating…" : "Create label",
              type: "submit",
              isDisabled: createDisabled || model.newLabelName.trim() === "",
            },
            h,
          ),
        ],
      ),
      model.labels._tag === "Loading"
        ? h.p([h.Role("status"), h.Class("text-sm text-gray-500")], ["Loading labels…"])
        : h.empty,
      Option.match(AsyncData.getError(model.labels), {
        onNone: () => h.empty,
        onSome: (problem) => renderProblem(problem, h),
      }),
      model.createLabel._tag === "Failed" ? renderProblem(model.createLabel.problem, h) : h.empty,
      !AsyncData.hasData(model.labels)
        ? h.empty
        : labels.length === 0
          ? h.p(
              [h.Class("text-sm text-gray-500")],
              ["Create a label to group saved vacancies around your own next steps."],
            )
          : h.ul(
              [h.Class("space-y-2")],
              labels.map((label) => labelDefinition(model, label, h)),
            ),
    ],
  );
};

const systemLabels = (item: SavedItem, h: HtmlBuilder<Message.Message>): Html =>
  h.section(
    [h.Class("space-y-2")],
    [
      h.h4([h.Class("text-sm font-semibold text-gray-900")], ["System labels"]),
      h.ul(
        [h.Class("space-y-1")],
        item.systemLabels.map((label) =>
          h.li(
            [h.Class("break-words text-sm text-gray-700")],
            [
              h.span([h.Class("font-semibold capitalize")], [label.name]),
              ` — evidence ${label.evidence.authority}: ${label.evidence.reference}`,
            ],
          ),
        ),
      ),
    ],
  );

const customLabels = (
  item: SavedItem,
  labels: ReadonlyArray<CustomLabel>,
  labelsAvailable: boolean,
  request: RequestStatus,
  definitionsLocked: boolean,
  h: HtmlBuilder<Message.Message>,
): Html =>
  h.fieldset(
    [...(request._tag === "Pending" ? [h.AriaBusy(true)] : []), h.Class("space-y-2")],
    [
      h.legend([h.Class("text-sm font-semibold text-gray-900")], ["Custom labels"]),
      !labelsAvailable
        ? h.p(
            [h.Class("text-sm text-gray-500")],
            ["Custom-label assignments are available after labels finish loading."],
          )
        : labels.length === 0
          ? h.p([h.Class("text-sm text-gray-500")], ["Create a custom label above to assign one."])
          : h.div(
              [h.Class("flex flex-wrap gap-x-4 gap-y-1")],
              labels.map((label) =>
                checkboxField(
                  {
                    id: `saved-${item.savedJobId}-label-${label.id}`,
                    label: label.name,
                    isChecked: item.customLabelIds.includes(label.id),
                    isDisabled: request._tag === "Pending" || definitionsLocked,
                    onToggle: (isAssigned) =>
                      Message.LabelAssignmentChanged({
                        savedJobId: item.savedJobId,
                        labelId: label.id,
                        isAssigned,
                      }),
                  },
                  h,
                ),
              ),
            ),
      request._tag === "Pending"
        ? h.p([h.Role("status"), h.Class("text-sm text-gray-500")], ["Saving labels…"])
        : h.empty,
      request._tag === "Failed" ? renderProblem(request.problem, h) : h.empty,
    ],
  );

const applicationHistoryList = (
  entries: ReadonlyArray<SavedApplicationHistoryEntry>,
  regionId: string,
  h: HtmlBuilder<Message.Message>,
): Html =>
  h.div(
    [h.Id(regionId), h.Class("space-y-2")],
    [
      entries.length === 0
        ? h.p([h.Class("text-sm text-gray-500")], ["No application attempts are recorded."])
        : h.ol(
            [h.Class("space-y-2")],
            entries.map((entry) =>
              h.keyed("li")(
                entry.applicationId,
                [h.Class("rounded-md border border-gray-200 p-3")],
                [
                  h.div(
                    [h.Class("flex flex-wrap items-start justify-between gap-2")],
                    [
                      h.p([h.Class("font-semibold text-gray-900")], [statusText(entry.status)]),
                      entry.isCurrent
                        ? h.span(
                            [
                              h.Class(
                                "rounded-md bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700",
                              ),
                            ],
                            ["Current attempt"],
                          )
                        : h.span(
                            [
                              h.Class(
                                "rounded-md bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-600",
                              ),
                            ],
                            ["Prior attempt"],
                          ),
                    ],
                  ),
                  h.dl(
                    [h.Class("mt-2 grid grid-cols-1 gap-x-3 gap-y-1 text-sm sm:grid-cols-2")],
                    [
                      h.dt([h.Class("text-gray-500")], ["Method"]),
                      h.dd(
                        [h.Class("break-words text-gray-700")],
                        [entry.method === "automated" ? "Automated" : "Assisted"],
                      ),
                      h.dt([h.Class("text-gray-500")], ["Created"]),
                      h.dd(
                        [h.Class("break-words text-gray-700")],
                        [h.time([h.Datetime(entry.createdAt)], [entry.createdAt])],
                      ),
                      h.dt([h.Class("text-gray-500")], ["Updated"]),
                      h.dd(
                        [h.Class("break-words text-gray-700")],
                        [h.time([h.Datetime(entry.updatedAt)], [entry.updatedAt])],
                      ),
                    ],
                  ),
                  entry.notes.trim() === ""
                    ? h.empty
                    : h.p([h.Class("mt-2 text-sm text-gray-700")], [`Notes: ${entry.notes}`]),
                  h.div(
                    [h.Class("mt-2")],
                    [
                      linkButton(
                        {
                          label: "Open application site ↗",
                          href: entry.applicationUrl,
                          target: "_blank",
                          rel: "noopener",
                          variant: "ghost",
                        },
                        h,
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
    ],
  );

const applicationHistory = (
  item: SavedItem,
  history: Model["itemRequests"][number]["history"],
  controlsDisabled: boolean,
  h: HtmlBuilder<Message.Message>,
): Html => {
  const regionId = `saved-${item.savedJobId}-application-history`;
  const hasAttempts = item.currentApplication !== null || item.priorAttemptCount > 0;
  return h.section(
    [h.AriaLabelledBy(`${regionId}-heading`), h.Class("space-y-2")],
    [
      h.h5(
        [h.Id(`${regionId}-heading`), h.Class("text-sm font-semibold text-gray-900")],
        ["Application history"],
      ),
      h.p(
        [h.Class("text-sm text-gray-600")],
        [
          `${item.priorAttemptCount} prior ${
            item.priorAttemptCount === 1 ? "attempt" : "attempts"
          } retained. History is shown newest first.`,
        ],
      ),
      hasAttempts
        ? AsyncData.match(history, {
            onIdle: () =>
              button(
                {
                  label: "Show application history",
                  variant: "secondary",
                  ariaControls: regionId,
                  ariaExpanded: false,
                  isDisabled: controlsDisabled,
                  onClick: Message.ApplicationHistoryRequested({
                    savedJobId: item.savedJobId,
                  }),
                },
                h,
              ),
            onLoading: () =>
              h.div(
                [h.Id(regionId), h.Class("space-y-2")],
                [
                  button(
                    {
                      label: "Loading application history…",
                      variant: "secondary",
                      ariaControls: regionId,
                      ariaExpanded: true,
                      isDisabled: true,
                    },
                    h,
                  ),
                  h.p(
                    [h.Role("status"), h.AriaLive("polite"), h.Class("text-sm text-gray-500")],
                    ["Loading application history…"],
                  ),
                ],
              ),
            onRefreshing: (response) =>
              h.div(
                [h.Class("space-y-2")],
                [
                  h.p(
                    [h.Role("status"), h.AriaLive("polite"), h.Class("text-sm text-gray-500")],
                    ["Refreshing application history…"],
                  ),
                  applicationHistoryList(response.data, regionId, h),
                ],
              ),
            onFailure: (problem) =>
              h.div(
                [h.Class("space-y-2")],
                [
                  button(
                    {
                      label: "Try application history again",
                      variant: "secondary",
                      ariaControls: regionId,
                      ariaExpanded: false,
                      isDisabled: controlsDisabled,
                      onClick: Message.ApplicationHistoryRequested({
                        savedJobId: item.savedJobId,
                      }),
                    },
                    h,
                  ),
                  renderProblem(problem, h),
                ],
              ),
            onStale: ({ error, data }) =>
              h.div(
                [h.Class("space-y-2")],
                [renderProblem(error, h), applicationHistoryList(data.data, regionId, h)],
              ),
            onSuccess: (response) => applicationHistoryList(response.data, regionId, h),
          })
        : h.p([h.Class("text-sm text-gray-500")], ["No application attempts yet."]),
    ],
  );
};

const application = (
  item: SavedItem,
  request: RequestStatus,
  history: Model["itemRequests"][number]["history"],
  dataPending: boolean,
  h: HtmlBuilder<Message.Message>,
): Html => {
  const current = item.currentApplication;
  const actions = current === null ? [] : eventActions(current.status);
  const applicationControlsDisabled =
    dataPending || request._tag === "Pending" || AsyncData.isPending(history);
  return h.section(
    [
      ...(request._tag === "Pending" ? [h.AriaBusy(true)] : []),
      h.Class("space-y-3 border-t border-gray-100 pt-4"),
    ],
    [
      h.h4([h.Class("text-sm font-semibold text-gray-900")], ["Application"]),
      current === null
        ? h.div(
            [h.Class("space-y-2")],
            [
              h.p([h.Class("text-sm text-gray-700")], ["No current application attempt."]),
              linkButton(
                {
                  label: "Open job to prepare",
                  href: Route.href(Route.RouteJobDetail({ jobId: item.canonicalJobId })),
                  variant: "secondary",
                },
                h,
              ),
            ],
          )
        : h.div(
            [h.Class("space-y-3")],
            [
              h.p(
                [h.Class("text-sm font-semibold text-gray-900")],
                [`Current status: ${statusText(current.status)}`],
              ),
              h.p(
                [h.Class("text-sm text-gray-600")],
                [
                  `${current.method === "automated" ? "Automated" : "Assisted"} preparation · Updated `,
                  h.time([h.Datetime(current.updatedAt)], [current.updatedAt]),
                ],
              ),
              linkButton(
                {
                  label: "Open application site ↗",
                  href: current.applicationUrl,
                  target: "_blank",
                  rel: "noopener",
                },
                h,
              ),
              current.status === "ready"
                ? h.p(
                    [h.Class("text-sm text-gray-600")],
                    [
                      "Submit on the external site first. Choose “I submitted externally — confirm” only after you personally complete that submission. This human-confirmation event is what changes the status to Submitted.",
                    ],
                  )
                : h.empty,
              actions.length === 0
                ? h.empty
                : h.div(
                    [h.Class("flex flex-wrap gap-2")],
                    actions.map((action) =>
                      button(
                        {
                          label: action.label,
                          variant: action.variant,
                          isDisabled: applicationControlsDisabled,
                          onClick: Message.ApplicationEventRequested({
                            savedJobId: item.savedJobId,
                            applicationId: current.id,
                            event: action.event,
                            expectedUpdatedAt: current.updatedAt,
                          }),
                        },
                        h,
                      ),
                    ),
                  ),
              request._tag === "Pending"
                ? h.p(
                    [h.Role("status"), h.AriaLive("polite"), h.Class("text-sm text-gray-500")],
                    ["Recording application update…"],
                  )
                : h.empty,
              request._tag === "Failed" ? renderProblem(request.problem, h) : h.empty,
            ],
          ),
      applicationHistory(item, history, applicationControlsDisabled, h),
    ],
  );
};

const savedCard = (
  model: Model,
  item: SavedItem,
  labels: ReadonlyArray<CustomLabel>,
  h: HtmlBuilder<Message.Message>,
): Html => {
  const requests = itemRequest(model, item.savedJobId);
  const labelRequest = requests?.labels ?? idleRequest;
  const applicationRequest = requests?.application ?? idleRequest;
  const historyRequest = requests?.history ?? idleHistory;
  const dataPending = AsyncData.isPending(model.saved) || model.loadMore._tag === "Pending";
  const labelDefinitionsLocked =
    dataPending || model.createLabel._tag === "Pending" || model.labelManager._tag !== "Idle";
  return h.keyed("li")(
    item.savedJobId,
    [],
    [
      card(
        [
          h.article(
            [h.Class("space-y-4")],
            [
              h.div(
                [h.Class("space-y-1")],
                [
                  h.h3([h.Class("text-lg font-semibold text-gray-900")], [item.snapshot.title]),
                  h.p(
                    [h.Class("text-sm text-gray-600")],
                    [`${item.snapshot.employerName} — ${item.snapshot.location}`],
                  ),
                  h.p(
                    [h.Class("text-sm text-gray-500")],
                    [
                      "Saved ",
                      h.time([h.Datetime(item.savedAt)], [item.savedAt]),
                      item.snapshot.deadline === undefined
                        ? ""
                        : ` · Deadline ${item.snapshot.deadline}`,
                    ],
                  ),
                  item.note.trim() === ""
                    ? h.empty
                    : h.p([h.Class("text-sm text-gray-700")], [`Note: ${item.note}`]),
                ],
              ),
              h.div(
                [h.Class("flex flex-wrap gap-2")],
                [
                  linkButton(
                    {
                      label: "View job",
                      href: Route.href(Route.RouteJobDetail({ jobId: item.canonicalJobId })),
                      variant: "secondary",
                    },
                    h,
                  ),
                  linkButton(
                    {
                      label: "Original listing ↗",
                      href: item.snapshot.applicationUrl,
                      target: "_blank",
                      rel: "noopener",
                      variant: "ghost",
                    },
                    h,
                  ),
                ],
              ),
              systemLabels(item, h),
              customLabels(
                item,
                labels,
                AsyncData.hasData(model.labels),
                labelRequest,
                labelDefinitionsLocked,
                h,
              ),
              application(item, applicationRequest, historyRequest, dataPending, h),
            ],
          ),
        ],
        h,
      ),
    ],
  );
};

const pageData = (
  model: Model,
  page: SavedPage,
  labels: ReadonlyArray<CustomLabel>,
  h: HtmlBuilder<Message.Message>,
): Html =>
  h.div(
    [h.Class("space-y-4")],
    [
      page.data.length === 0
        ? card(
            [
              h.p([h.Class("font-semibold text-gray-900")], ["No saved vacancies match."]),
              h.p(
                [h.Class("mt-1 text-sm text-gray-600")],
                ["Change the filters, or browse vacancies and shortlist one for this workspace."],
              ),
              h.div(
                [h.Class("mt-3")],
                [
                  linkButton(
                    {
                      label: "Browse vacancies",
                      href: Route.href(Route.RouteBrowse({ term: "", location: "", status: "" })),
                    },
                    h,
                  ),
                ],
              ),
            ],
            h,
          )
        : h.ul(
            [h.Class("space-y-4")],
            page.data.map((item) => savedCard(model, item, labels, h)),
          ),
      model.loadMore._tag === "Failed" ? renderProblem(model.loadMore.problem, h) : h.empty,
      page.meta.nextCursor === null
        ? h.empty
        : h.div(
            [h.Class("flex justify-center")],
            [
              button(
                {
                  label: model.loadMore._tag === "Pending" ? "Loading more…" : "Load more",
                  variant: "secondary",
                  isDisabled: filtersLocked(model),
                  onClick: Message.NextPageRequested(),
                },
                h,
              ),
            ],
          ),
    ],
  );

const savedResults = (
  model: Model,
  labels: ReadonlyArray<CustomLabel>,
  h: HtmlBuilder<Message.Message>,
): Html =>
  AsyncData.match(model.saved, {
    onIdle: () => h.p([h.Class("text-sm text-gray-500")], ["Saved has not loaded yet."]),
    onLoading: () => h.p([h.Role("status"), h.Class("text-sm text-gray-500")], ["Loading Saved…"]),
    onRefreshing: (page) =>
      h.div(
        [h.Class("space-y-3")],
        [
          h.p(
            [h.Role("status"), h.AriaLive("polite"), h.Class("text-sm text-gray-500")],
            ["Refreshing Saved…"],
          ),
          pageData(model, page, labels, h),
        ],
      ),
    onFailure: (problem) => renderProblem(problem, h),
    onStale: ({ error, data }) =>
      h.div([h.Class("space-y-3")], [renderProblem(error, h), pageData(model, data, labels, h)]),
    onSuccess: (page) => pageData(model, page, labels, h),
  });

export type ViewInputs = Readonly<{ isAuthenticated: boolean }>;

export const view = defineView<Model, Message.Message, ViewInputs>(
  (model, { isAuthenticated }, h) => {
    const labels = Option.match(AsyncData.getData(model.labels), {
      onNone: () => [] as ReadonlyArray<CustomLabel>,
      onSome: (response) => response.data,
    });
    return h.div(
      [h.Class(pageClass)],
      [
        h.div(
          [h.Class("flex flex-wrap items-start justify-between gap-3")],
          [
            h.div(
              [h.Class("space-y-1")],
              [
                sectionHeading("Saved", h),
                h.p(
                  [h.Class("text-sm text-gray-600")],
                  [
                    "Durable bookmarks, application attempts, and the next action each vacancy needs.",
                  ],
                ),
              ],
            ),
            isAuthenticated
              ? button(
                  {
                    label: AsyncData.isPending(model.saved) ? "Refreshing…" : "Refresh",
                    variant: "secondary",
                    isDisabled: filtersLocked(model),
                    onClick: Message.Requested(),
                  },
                  h,
                )
              : h.empty,
          ],
        ),
        isAuthenticated
          ? h.div(
              [h.Class("space-y-6")],
              [
                filtersView(model, labels, h),
                labelManager(model, labels, h),
                savedResults(model, labels, h),
              ],
            )
          : card(
              [
                h.p([h.Class("font-semibold text-gray-900")], ["Sign in to open Saved."]),
                h.p(
                  [h.Class("mt-1 text-sm text-gray-600")],
                  ["Enter a session token above to load your owner-scoped workspace."],
                ),
              ],
              h,
            ),
      ],
    );
  },
);
