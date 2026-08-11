import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Layer from "effect/Layer";
import {
  CustomLabel,
  LabelAssignment,
  SavedJob,
  type SystemLabelName,
} from "@job-index/domain/Applications";
import {
  CustomLabelMissing,
  LabelNameConflict,
  ReservedLabelMutation,
  SavedJobMissing,
} from "@job-index/domain/Failure";
import type { CustomLabelId, ProfileId, SavedJobId } from "@job-index/domain/Ids";
import {
  savedSystemLabel,
  type CurrentApplicationSummary,
  type SavedItem,
  type SavedPage,
  type SavedSort,
  type SavedView,
} from "@job-index/domain/Saved";
import { atom, difference, evaluate, union } from "@job-index/domain/SetExpression";
import { Database } from "../services/Database.ts";
import { Ids } from "../services/Ids.ts";
import { Saved } from "../services/Saved.ts";
import type { SavedQuery } from "../services/Saved.ts";
import * as Labels from "./labels.ts";

const decodeSavedJobRow = Schema.decodeUnknownSync(SavedJob.select);
const PAGE_LIMIT = 50;
const SYSTEM_LABELS: ReadonlyArray<SystemLabelName> = ["saved", "closed", "expired", "occupied"];
const CLOSED_EXPRESSION = union(
  atom(savedSystemLabel("closed")),
  union(atom(savedSystemLabel("expired")), atom(savedSystemLabel("occupied"))),
);
const ACTIVE_EXPRESSION = difference(atom(savedSystemLabel("saved")), CLOSED_EXPRESSION);

interface SavedRow {
  readonly id: string;
  readonly profileId: string;
  readonly canonicalJobId: string;
  readonly jobSnapshot: string;
  readonly note: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly sourceCanonicalJobId?: string | null;
  readonly statusTag?: string;
  readonly statusClosedAt?: string | null;
  readonly deadline?: string | null;
  readonly currentApplicationId?: string | null;
  readonly currentStatus?: string | null;
  readonly currentMethod?: string | null;
  readonly currentApplicationUrl?: string | null;
  readonly currentCreatedAt?: string | null;
  readonly currentUpdatedAt?: string | null;
  readonly priorAttemptCount?: number;
}

interface AssignmentRow {
  readonly savedJobId: SavedJobId;
  readonly labelId: CustomLabelId;
}

const normalizeName = (name: string): string =>
  name.trim().replace(/\s+/g, " ").toLocaleLowerCase();

const reserved = (normalizedName: string): SystemLabelName | undefined =>
  SYSTEM_LABELS.find((label) => label === normalizedName);

const parseCursor = (cursor: string | undefined): number => {
  if (cursor === undefined || cursor.trim() === "") return 0;
  const parsed = Number(cursor);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
};

const systemLabels = (
  row: SavedRow,
  now: Date,
  snapshotDeadline: string | undefined,
): SavedItem["systemLabels"] => {
  const labels: Array<SavedItem["systemLabels"][number]> = [
    {
      name: "saved",
      evidence: { reference: `saved_jobs:${row.id}`, authority: "saved-bookmark" },
    },
  ];
  if (row.statusTag === "Closed") {
    labels.push({
      name: "closed",
      evidence: {
        reference: `canonical_jobs:${row.canonicalJobId}:status`,
        authority: "source-corpus",
      },
    });
  }
  const hasCurrentSource =
    row.sourceCanonicalJobId !== null && row.sourceCanonicalJobId !== undefined;
  const deadline = hasCurrentSource ? (row.deadline ?? undefined) : snapshotDeadline;
  if (
    deadline !== undefined &&
    Number.isFinite(Date.parse(deadline)) &&
    Date.parse(deadline) < now.getTime()
  ) {
    labels.push({
      name: "expired",
      evidence: {
        reference: hasCurrentSource
          ? `canonical_jobs:${row.canonicalJobId}:deadline:${deadline}`
          : `saved_jobs:${row.id}:snapshot:deadline:${deadline}`,
        authority: hasCurrentSource ? "source-corpus" : "saved-bookmark",
      },
    });
  }
  return labels;
};

const itemFromRow = (
  row: SavedRow,
  assignments: ReadonlyArray<AssignmentRow>,
  now: Date,
): SavedItem => {
  const parsed = decodeSavedJobRow(row).jobSnapshot;
  const labels = systemLabels(row, now, parsed.deadline);
  const currentApplication: SavedItem["currentApplication"] =
    row.currentApplicationId === null || row.currentApplicationId === undefined
      ? null
      : ({
          id: row.currentApplicationId as CurrentApplicationSummary["id"],
          status: row.currentStatus as CurrentApplicationSummary["status"],
          method: row.currentMethod as CurrentApplicationSummary["method"],
          applicationUrl: row.currentApplicationUrl ?? "",
          createdAt: row.currentCreatedAt ?? "",
          updatedAt: row.currentUpdatedAt ?? "",
        } satisfies CurrentApplicationSummary);
  return {
    savedJobId: row.id as SavedJobId,
    canonicalJobId: row.canonicalJobId as SavedItem["canonicalJobId"],
    snapshot: parsed,
    note: row.note,
    systemLabels: labels,
    customLabelIds: assignments
      .filter((assignment) => assignment.savedJobId === row.id)
      .map((assignment) => assignment.labelId),
    currentApplication,
    priorAttemptCount: row.priorAttemptCount ?? 0,
    savedAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
};

const matchesView = (item: SavedItem, view: SavedView): boolean => {
  const memberships = item.systemLabels.map((label) => savedSystemLabel(label.name));
  switch (view) {
    case "all":
      return true;
    case "active":
      return evaluate(ACTIVE_EXPRESSION, memberships);
    case "closed":
      return evaluate(CLOSED_EXPRESSION, memberships);
    case "needs-action":
      return item.currentApplication === null || item.currentApplication.status === "ready";
    case "applied":
      return (
        item.currentApplication !== null &&
        ["submitted", "interview", "offer", "rejected"].includes(item.currentApplication.status)
      );
  }
};

const compareItems =
  (sort: SavedSort) =>
  (left: SavedItem, right: SavedItem): number => {
    if (sort === "deadline-soon") {
      const leftDeadline =
        left.snapshot.deadline === undefined
          ? Number.POSITIVE_INFINITY
          : Date.parse(left.snapshot.deadline);
      const rightDeadline =
        right.snapshot.deadline === undefined
          ? Number.POSITIVE_INFINITY
          : Date.parse(right.snapshot.deadline);
      return leftDeadline - rightDeadline || right.savedAt.localeCompare(left.savedAt);
    }
    if (sort === "recently-updated") {
      return (
        right.updatedAt.localeCompare(left.updatedAt) || right.savedAt.localeCompare(left.savedAt)
      );
    }
    return right.savedAt.localeCompare(left.savedAt);
  };

export const layer = Layer.effect(
  Saved,
  Effect.gen(function* () {
    const database = yield* Database;
    const ids = yield* Ids;
    const withDatabase = <A>(effect: Effect.Effect<A, never, Database>): Effect.Effect<A> =>
      Effect.provideService(effect, Database, database);

    const list = (profile: ProfileId, query: SavedQuery): Effect.Effect<SavedPage> =>
      Effect.gen(function* () {
        const rows = yield* database.query<SavedRow>(
          `SELECT sj.*, cj.id AS sourceCanonicalJobId, cj.statusTag, cj.statusClosedAt, cj.deadline,
             a.id AS currentApplicationId,
             a.status AS currentStatus,
             a.method AS currentMethod,
             a.applicationUrl AS currentApplicationUrl,
             a.createdAt AS currentCreatedAt,
             a.updatedAt AS currentUpdatedAt,
             (SELECT COUNT(*) FROM applications prior
                WHERE prior.savedJobId = sj.id AND prior.id != aa.applicationId) AS priorAttemptCount
           FROM saved_jobs sj
           LEFT JOIN canonical_jobs cj ON cj.id = sj.canonicalJobId
           LEFT JOIN active_applications aa ON aa.savedJobId = sj.id AND aa.profileId = sj.profileId
           LEFT JOIN applications a ON a.id = aa.applicationId AND a.profileId = sj.profileId
           WHERE sj.profileId = ?`,
          [profile],
        );
        const assignments = yield* database.query<AssignmentRow>(
          `SELECT savedJobId, labelId FROM label_assignments WHERE profileId = ?`,
          [profile],
        );
        const now = yield* DateTime.now;
        const nowDate = DateTime.toDate(now);
        const items = rows
          .map((row) => itemFromRow(row, assignments, nowDate))
          .filter((item) => matchesView(item, query.view))
          .filter((item) => query.label === undefined || item.customLabelIds.includes(query.label))
          .toSorted(compareItems(query.sort));
        const offset = parseCursor(query.cursor);
        const page = items.slice(offset, offset + PAGE_LIMIT);
        return {
          data: page,
          meta: {
            limit: PAGE_LIMIT,
            nextCursor: offset + PAGE_LIMIT < items.length ? String(offset + PAGE_LIMIT) : null,
          },
        };
      });

    const labels = (profile: ProfileId) => withDatabase(Labels.findByProfile(profile));

    const createLabel = (profile: ProfileId, name: string) =>
      Effect.gen(function* () {
        const trimmed = name.trim().replace(/\s+/g, " ");
        const normalizedName = normalizeName(trimmed);
        if (reserved(normalizedName) !== undefined) {
          return yield* Effect.fail(new ReservedLabelMutation({ name: trimmed }));
        }
        const conflict = yield* withDatabase(Labels.findByNormalizedName(profile, normalizedName));
        if (conflict !== undefined) {
          return yield* Effect.fail(new LabelNameConflict({ name: trimmed, normalizedName }));
        }
        const now = yield* DateTime.now;
        const label = new CustomLabel({
          id: (yield* ids.next) as CustomLabelId,
          profileId: profile,
          name: trimmed,
          normalizedName,
          createdAt: now,
          updatedAt: now,
        });
        yield* database.atomic([yield* withDatabase(Labels.insertWrite(label))]);
        return label;
      });

    const renameLabel = (profile: ProfileId, labelId: CustomLabelId, name: string) =>
      Effect.gen(function* () {
        const existing = yield* withDatabase(Labels.findByIdForProfile(profile, labelId));
        if (existing === undefined)
          return yield* Effect.fail(new CustomLabelMissing({ label: labelId }));
        const trimmed = name.trim().replace(/\s+/g, " ");
        const normalizedName = normalizeName(trimmed);
        if (reserved(normalizedName) !== undefined) {
          return yield* Effect.fail(new ReservedLabelMutation({ name: trimmed }));
        }
        const conflict = yield* withDatabase(Labels.findByNormalizedName(profile, normalizedName));
        if (conflict !== undefined && conflict.id !== existing.id) {
          return yield* Effect.fail(new LabelNameConflict({ name: trimmed, normalizedName }));
        }
        const now = yield* DateTime.now;
        const updated = new CustomLabel({
          id: existing.id,
          profileId: existing.profileId,
          name: trimmed,
          normalizedName,
          createdAt: existing.createdAt,
          updatedAt: now,
        });
        yield* database.atomic([yield* withDatabase(Labels.updateWrite(updated))]);
        return updated;
      });

    const deleteLabel = (profile: ProfileId, labelId: CustomLabelId) =>
      Effect.gen(function* () {
        const existing = yield* withDatabase(Labels.findByIdForProfile(profile, labelId));
        if (existing === undefined)
          return yield* Effect.fail(new CustomLabelMissing({ label: labelId }));
        yield* database.atomic([
          Labels.deleteAssignmentsWrite(profile, labelId),
          Labels.deleteLabelWrite(profile, labelId),
        ]);
      });

    const setLabels = (
      profile: ProfileId,
      savedJob: SavedJobId,
      labelIds: ReadonlyArray<CustomLabelId>,
    ) =>
      Effect.gen(function* () {
        const savedRows = yield* database.query<{ readonly id: string }>(
          "SELECT id FROM saved_jobs WHERE id = ? AND profileId = ?",
          [savedJob, profile],
        );
        if (savedRows[0] === undefined)
          return yield* Effect.fail(new SavedJobMissing({ savedJob }));
        const uniqueIds = [...new Set(labelIds)];
        const invalidReserved = uniqueIds.find((id) => reserved(normalizeName(id)) !== undefined);
        if (invalidReserved !== undefined) {
          return yield* Effect.fail(new ReservedLabelMutation({ name: invalidReserved }));
        }
        const owned = yield* withDatabase(Labels.findOwnedIds(profile, uniqueIds));
        if (owned.length !== uniqueIds.length) {
          const ownedSet = new Set(owned);
          const missing = uniqueIds.find((id) => !ownedSet.has(id)) ?? uniqueIds[0] ?? "";
          return yield* Effect.fail(new CustomLabelMissing({ label: missing }));
        }
        const now = yield* DateTime.now;
        const writes = [Labels.deleteAssignmentsForSavedWrite(profile, savedJob)];
        for (const labelId of uniqueIds) {
          writes.push(
            yield* withDatabase(
              Labels.assignmentWrite(
                new LabelAssignment({
                  profileId: profile,
                  savedJobId: savedJob,
                  labelId,
                  createdAt: now,
                }),
              ),
            ),
          );
        }
        yield* database.atomic(writes);
      });

    return Saved.of({ list, labels, createLabel, renameLabel, deleteLabel, setLabels });
  }),
);
