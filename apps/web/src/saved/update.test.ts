import * as Option from "effect/Option";
import * as S from "effect/Schema";
import { describe, expect, it } from "vitest";
import { SavedPage } from "../../../worker/src/Api.ts";
import { CustomLabelId } from "@job-index/domain/Ids";
import { LabelConflict, NetworkError } from "../RequestStatus.ts";
import * as Message from "./Message.ts";
import { CustomLabelsResponse, init, type Model } from "./Model.ts";
import { update } from "./update.ts";

const customLabelId = S.decodeUnknownSync(CustomLabelId);

const page = S.decodeUnknownSync(SavedPage)({
  data: [
    {
      savedJobId: "saved-1",
      canonicalJobId: "job-1",
      snapshot: {
        title: "Software Engineer",
        employerName: "Acme",
        location: "Oslo",
        description: "Build durable systems.",
        applicationUrl: "https://ats.example/jobs/1",
        publishedAt: "2026-08-01T09:00:00Z",
        deadline: "2026-08-31T23:59:59Z",
      },
      note: "Ask about the platform team",
      systemLabels: [
        {
          name: "saved",
          evidence: { reference: "saved-1", authority: "user-bookmark" },
        },
      ],
      customLabelIds: ["label-1"],
      currentApplication: {
        id: "application-1",
        status: "ready",
        method: "assisted",
        applicationUrl: "https://ats.example/jobs/1/apply",
        createdAt: "2026-08-10T10:00:00Z",
        updatedAt: "2026-08-10T10:00:00Z",
      },
      priorAttemptCount: 2,
      savedAt: "2026-08-09T10:00:00Z",
      updatedAt: "2026-08-10T10:00:00Z",
    },
  ],
  meta: { limit: 20, nextCursor: null },
});

const labels = S.decodeUnknownSync(CustomLabelsResponse)({
  data: [
    {
      id: "label-1",
      name: "Follow up",
      normalizedName: "follow up",
      createdAt: "2026-08-09T10:00:00Z",
      updatedAt: "2026-08-09T10:00:00Z",
    },
    {
      id: "label-2",
      name: "Priority",
      normalizedName: "priority",
      createdAt: "2026-08-09T10:00:00Z",
      updatedAt: "2026-08-09T10:00:00Z",
    },
  ],
});

const applicationHistory = {
  data: [
    {
      applicationId: "application-1",
      status: "ready",
      method: "assisted",
      applicationUrl: "https://ats.example/jobs/1/apply",
      notes: "Current attempt",
      createdAt: "2026-08-10T10:00:00Z",
      updatedAt: "2026-08-10T10:00:00Z",
      isCurrent: true,
    },
    {
      applicationId: "application-0",
      status: "withdrawn",
      method: "assisted",
      applicationUrl: "https://ats.example/jobs/1/apply",
      notes: "Prior attempt",
      createdAt: "2026-08-09T10:00:00Z",
      updatedAt: "2026-08-09T12:00:00Z",
      isCurrent: false,
    },
  ],
} as const;

const loaded = (): Model => ({
  ...init(),
  saved: { _tag: "Success", data: page },
  labels: { _tag: "Success", data: labels },
});

describe("Saved loading and filters", () => {
  it("loads the owner-scoped page and custom labels together", () => {
    const [model, commands] = update(init(), Message.Requested());
    expect(model.saved._tag).toBe("Loading");
    expect(model.labels._tag).toBe("Loading");
    expect(commands.map((command) => command.name)).toEqual(["FetchSaved", "FetchSavedLabels"]);
  });

  it("reloads through the product preset contract", () => {
    const [model, commands] = update(loaded(), Message.ViewChanged({ value: "needs-action" }));
    expect(model.filters.view).toBe("needs-action");
    expect(model.saved._tag).toBe("Loading");
    expect(commands[0]?.args).toMatchObject({
      view: "needs-action",
      sort: "recently-saved",
      append: false,
    });
  });

  it("invalidates stale Saved data without dropping owner-scoped label definitions", () => {
    const [model] = update(loaded(), Message.Invalidated());
    expect(model.saved._tag).toBe("Idle");
    expect(model.labels).toEqual(loaded().labels);
  });
});

describe("Saved filter composition", () => {
  it("sends the preset and custom-label predicate together as an AND query", () => {
    const labelId = customLabelId("label-1");
    const filtered: Model = {
      ...loaded(),
      filters: {
        view: "active",
        customLabelId: labelId,
        sort: "recently-saved",
      },
    };
    const [, commands] = update(filtered, Message.SortChanged({ value: "recently-updated" }));
    expect(commands[0]?.args).toMatchObject({
      view: "active",
      label: Option.some(labelId),
      sort: "recently-updated",
    });
  });
});

describe("custom labels", () => {
  it("replaces only custom-label ids and settles the card request", () => {
    const [pending, commands] = update(
      loaded(),
      Message.LabelAssignmentChanged({
        savedJobId: "saved-1",
        labelId: customLabelId("label-2"),
        isAssigned: true,
      }),
    );
    expect(pending.itemRequests[0]?.labels._tag).toBe("Pending");
    expect(commands[0]?.name).toBe("SetSavedLabels");
    expect(commands[0]?.args).toMatchObject({
      savedJobId: "saved-1",
      labelIds: ["label-1", "label-2"],
    });

    const [settled] = update(
      pending,
      Message.LabelAssignmentSucceeded({
        savedJobId: "saved-1",
        labelIds: [customLabelId("label-1"), customLabelId("label-2")],
      }),
    );
    expect(settled.saved).toMatchObject({
      data: { data: [{ customLabelIds: ["label-1", "label-2"] }] },
    });
    expect(settled.itemRequests[0]?.labels._tag).toBe("Idle");
  });
});

describe("custom label definitions", () => {
  it("renames one owner-scoped label through an explicit editor state", () => {
    const labelId = customLabelId("label-1");
    const [editing] = update(loaded(), Message.LabelRenameStarted({ labelId }));
    expect(editing.labelManager).toMatchObject({
      _tag: "Renaming",
      labelId,
      name: "Follow up",
      request: { _tag: "Idle" },
    });

    const [changed] = update(editing, Message.LabelRenameNameChanged({ value: "  Next step  " }));
    const [pending, commands] = update(changed, Message.RenameLabelRequested({ labelId }));
    expect(pending.labelManager).toMatchObject({
      _tag: "Renaming",
      name: "Next step",
      request: { _tag: "Pending" },
    });
    expect(commands[0]).toMatchObject({
      name: "RenameSavedLabel",
      args: { labelId, name: "Next step" },
    });

    const renamed = {
      ...labels.data[0]!,
      name: "Next step",
      normalizedName: "next step",
      updatedAt: "2026-08-10T11:00:00Z",
    };
    const [settled] = update(pending, Message.LabelRenamed({ label: renamed }));
    expect(settled.labelManager).toEqual({ _tag: "Idle" });
    expect(settled.labels).toMatchObject({
      data: { data: [{ id: labelId, name: "Next step" }, { id: "label-2" }] },
    });
  });

  it("keeps a rename conflict inline in the active editor", () => {
    const labelId = customLabelId("label-1");
    const [editing] = update(loaded(), Message.LabelRenameStarted({ labelId }));
    const problem = new LabelConflict({ name: "Priority", normalizedName: "priority" });
    const [changed] = update(editing, Message.LabelRenameNameChanged({ value: "Priority" }));
    const [pending] = update(changed, Message.RenameLabelRequested({ labelId }));
    const [failed] = update(pending, Message.RenameLabelFailed({ labelId, problem }));
    expect(failed.labelManager).toMatchObject({
      _tag: "Renaming",
      labelId,
      request: { _tag: "Failed", problem },
    });
  });

  it("deletes a label only after the confirmation state and removes cached assignments", () => {
    const labelId = customLabelId("label-1");
    const [confirming] = update(loaded(), Message.LabelDeleteStarted({ labelId }));
    expect(confirming.labelManager).toMatchObject({
      _tag: "Deleting",
      labelId,
      request: { _tag: "Idle" },
    });

    const [pending, commands] = update(confirming, Message.DeleteLabelRequested({ labelId }));
    expect(commands[0]).toMatchObject({
      name: "DeleteSavedLabel",
      args: { labelId },
    });

    const [deleted] = update(pending, Message.LabelDeleted({ labelId }));
    expect(deleted.labelManager).toEqual({ _tag: "Idle" });
    expect(deleted.labels).toMatchObject({ data: { data: [{ id: "label-2" }] } });
    expect(deleted.saved).toMatchObject({ data: { data: [{ customLabelIds: [] }] } });
  });

  it("clears a deleted active label filter and reloads without that predicate", () => {
    const labelId = customLabelId("label-1");
    const filtered: Model = {
      ...loaded(),
      filters: { ...loaded().filters, customLabelId: labelId },
    };
    const [confirming] = update(filtered, Message.LabelDeleteStarted({ labelId }));
    const [pending] = update(confirming, Message.DeleteLabelRequested({ labelId }));
    const [deleted, commands] = update(pending, Message.LabelDeleted({ labelId }));
    expect(deleted.filters.customLabelId).toBeNull();
    expect(deleted.saved._tag).toBe("Loading");
    expect(commands[0]).toMatchObject({
      name: "FetchSaved",
      args: { label: Option.none(), append: false },
    });
  });
});

describe("application events", () => {
  it("sends the stale-check timestamp and refreshes after explicit confirmation", () => {
    const [pending, commands] = update(
      loaded(),
      Message.ApplicationEventRequested({
        savedJobId: "saved-1",
        applicationId: "application-1",
        event: "confirm-submission",
        expectedUpdatedAt: "2026-08-10T10:00:00Z",
      }),
    );
    expect(commands[0]?.name).toBe("AddApplicationEvent");
    expect(commands[0]?.args).toMatchObject({
      applicationId: "application-1",
      event: "confirm-submission",
      expectedUpdatedAt: "2026-08-10T10:00:00Z",
    });

    const [confirmed, refreshCommands] = update(
      pending,
      Message.ApplicationEventSucceeded({
        savedJobId: "saved-1",
        response: {
          applicationId: "application-1",
          status: "submitted",
          updatedAt: "2026-08-10T10:05:00Z",
        },
      }),
    );
    expect(confirmed.saved).toMatchObject({
      _tag: "Refreshing",
      data: { data: [{ currentApplication: { status: "submitted" } }] },
    });
    expect(refreshCommands.map((command) => command.name)).toEqual(["FetchSaved"]);
  });

  it("keeps a failed mutation on the card instead of changing durable data", () => {
    const problem = NetworkError({ detail: "offline" });
    const [failed] = update(
      loaded(),
      Message.ApplicationEventFailed({ savedJobId: "saved-1", problem }),
    );
    expect(failed.itemRequests[0]?.application).toEqual({ _tag: "Failed", problem });
    expect(failed.saved).toEqual(loaded().saved);
  });
});

describe("application history", () => {
  it("loads one saved item's newest-first history on demand", () => {
    const [loading, commands] = update(
      loaded(),
      Message.ApplicationHistoryRequested({ savedJobId: "saved-1" }),
    );
    expect(loading.itemRequests[0]?.history._tag).toBe("Loading");
    expect(commands[0]).toMatchObject({
      name: "FetchSavedApplicationHistory",
      args: { savedJobId: "saved-1" },
    });

    const [succeeded] = update(
      loading,
      Message.ApplicationHistorySucceeded({
        savedJobId: "saved-1",
        response: applicationHistory,
      }),
    );
    expect(succeeded.itemRequests[0]?.history).toMatchObject({
      _tag: "Success",
      data: {
        data: [
          { applicationId: "application-1", isCurrent: true },
          { applicationId: "application-0", isCurrent: false },
        ],
      },
    });

    const [patched] = update(
      succeeded,
      Message.ApplicationEventSucceeded({
        savedJobId: "saved-1",
        response: {
          applicationId: "application-1",
          status: "submitted",
          updatedAt: "2026-08-10T10:05:00Z",
        },
      }),
    );
    expect(patched.itemRequests[0]?.history).toMatchObject({
      data: {
        data: [
          {
            applicationId: "application-1",
            status: "submitted",
            updatedAt: "2026-08-10T10:05:00Z",
          },
          { applicationId: "application-0", status: "withdrawn" },
        ],
      },
    });

    const [refreshed] = update(patched, Message.FetchSucceeded({ page, append: false }));
    expect(refreshed.itemRequests[0]?.history).toEqual(patched.itemRequests[0]?.history);
  });

  it("keeps history failure on its card, allows retry, and locks filter changes while loading", () => {
    const [loading] = update(
      loaded(),
      Message.ApplicationHistoryRequested({ savedJobId: "saved-1" }),
    );
    const [locked, filterCommands] = update(loading, Message.ViewChanged({ value: "closed" }));
    expect(locked.filters.view).toBe("all");
    expect(filterCommands).toEqual([]);

    const problem = NetworkError({ detail: "offline" });
    const [failed] = update(
      loading,
      Message.ApplicationHistoryFailed({ savedJobId: "saved-1", problem }),
    );
    expect(failed.itemRequests[0]?.history).toEqual({ _tag: "Failure", error: problem });

    const [retrying, retryCommands] = update(
      failed,
      Message.ApplicationHistoryRequested({ savedJobId: "saved-1" }),
    );
    expect(retrying.itemRequests[0]?.history._tag).toBe("Loading");
    expect(retryCommands.map((command) => command.name)).toEqual(["FetchSavedApplicationHistory"]);
  });
});
