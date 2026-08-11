import * as Effect from "effect/Effect";
import { CustomLabel, LabelAssignment } from "@job-index/domain/Applications";
import type { CustomLabelId, ProfileId, SavedJobId } from "@job-index/domain/Ids";
import { Database } from "../services/Database.ts";
import type { Write } from "../services/Database.ts";
import {
  columnsOf,
  decodeRow,
  decodeRows,
  encodeVariant,
  insertStatement,
  updateStatement,
} from "../db/Sql.ts";

const LABELS = "custom_labels";
const ASSIGNMENTS = "label_assignments";
const labelVariant = (CustomLabel as never as { insert: object }).insert as never;
const assignmentVariant = (LabelAssignment as never as { insert: object }).insert as never;

export const findByProfile = (
  profileId: ProfileId,
): Effect.Effect<ReadonlyArray<CustomLabel>, never, Database> =>
  Effect.gen(function* () {
    const db = yield* Database;
    const rows = yield* db.query<unknown>(
      `SELECT * FROM ${LABELS} WHERE profileId = ? ORDER BY name COLLATE NOCASE ASC, id ASC`,
      [profileId],
    );
    return yield* decodeRows<CustomLabel>(CustomLabel as never)(rows);
  });

export const findByIdForProfile = (
  profileId: ProfileId,
  labelId: CustomLabelId,
): Effect.Effect<CustomLabel | undefined, never, Database> =>
  Effect.gen(function* () {
    const db = yield* Database;
    const rows = yield* db.query<unknown>(
      `SELECT * FROM ${LABELS} WHERE profileId = ? AND id = ?`,
      [profileId, labelId],
    );
    return rows[0] === undefined
      ? undefined
      : yield* decodeRow<CustomLabel>(CustomLabel as never)(rows[0]);
  });

export const findByNormalizedName = (
  profileId: ProfileId,
  normalizedName: string,
): Effect.Effect<CustomLabel | undefined, never, Database> =>
  Effect.gen(function* () {
    const db = yield* Database;
    const rows = yield* db.query<unknown>(
      `SELECT * FROM ${LABELS} WHERE profileId = ? AND normalizedName = ?`,
      [profileId, normalizedName],
    );
    return rows[0] === undefined
      ? undefined
      : yield* decodeRow<CustomLabel>(CustomLabel as never)(rows[0]);
  });

export const findOwnedIds = (
  profileId: ProfileId,
  labelIds: ReadonlyArray<CustomLabelId>,
): Effect.Effect<ReadonlyArray<CustomLabelId>, never, Database> =>
  Effect.gen(function* () {
    if (labelIds.length === 0) return [];
    const db = yield* Database;
    const placeholders = labelIds.map(() => "?").join(", ");
    const rows = yield* db.query<{ readonly id: string }>(
      `SELECT id FROM ${LABELS} WHERE profileId = ? AND id IN (${placeholders})`,
      [profileId, ...labelIds],
    );
    return rows.map((row) => row.id as CustomLabelId);
  });

export const insertWrite = (label: CustomLabel): Effect.Effect<Write, never, Database> =>
  Effect.map(encodeVariant<CustomLabel>(labelVariant)(label), (encoded) =>
    insertStatement(LABELS, columnsOf(labelVariant), encoded),
  );

export const updateWrite = (label: CustomLabel): Effect.Effect<Write, never, Database> =>
  Effect.map(
    encodeVariant<CustomLabel>((CustomLabel as never as { update: object }).update as never)(label),
    (encoded) =>
      updateStatement(
        LABELS,
        columnsOf((CustomLabel as never as { update: object }).update as never),
        ["id"],
        encoded,
      ),
  );

export const deleteAssignmentsWrite = (profileId: ProfileId, labelId: CustomLabelId): Write => ({
  sql: `DELETE FROM ${ASSIGNMENTS} WHERE profileId = ? AND labelId = ?`,
  bindings: [profileId, labelId],
});

export const deleteLabelWrite = (profileId: ProfileId, labelId: CustomLabelId): Write => ({
  sql: `DELETE FROM ${LABELS} WHERE profileId = ? AND id = ?`,
  bindings: [profileId, labelId],
});

export const deleteAssignmentsForSavedWrite = (
  profileId: ProfileId,
  savedJobId: SavedJobId,
): Write => ({
  sql: `DELETE FROM ${ASSIGNMENTS} WHERE profileId = ? AND savedJobId = ?`,
  bindings: [profileId, savedJobId],
});

export const assignmentWrite = (
  assignment: LabelAssignment,
): Effect.Effect<Write, never, Database> =>
  Effect.map(encodeVariant<LabelAssignment>(assignmentVariant)(assignment), (encoded) =>
    insertStatement(ASSIGNMENTS, columnsOf(assignmentVariant), encoded),
  );

export const assigned = (
  profileId: ProfileId,
): Effect.Effect<
  ReadonlyArray<{ savedJobId: SavedJobId; labelId: CustomLabelId }>,
  never,
  Database
> =>
  Effect.gen(function* () {
    const db = yield* Database;
    return yield* db.query<{ savedJobId: SavedJobId; labelId: CustomLabelId }>(
      `SELECT savedJobId, labelId FROM ${ASSIGNMENTS} WHERE profileId = ?`,
      [profileId],
    );
  });

export const deleteByProfileWrite = (profileId: ProfileId): Write => ({
  sql: `DELETE FROM ${LABELS} WHERE profileId = ?`,
  bindings: [profileId],
});

export const deleteAssignmentsByProfileWrite = (profileId: ProfileId): Write => ({
  sql: `DELETE FROM ${ASSIGNMENTS} WHERE profileId = ?`,
  bindings: [profileId],
});
