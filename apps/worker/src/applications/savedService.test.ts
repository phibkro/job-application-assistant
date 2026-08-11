import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type { ApplicationId, CustomLabelId, ProfileId, SavedJobId } from "@job-index/domain/Ids";
import {
  CustomLabelMissing,
  LabelNameConflict,
  ReservedLabelMutation,
  SavedJobMissing,
} from "@job-index/domain/Failure";
import { layerSqlite } from "../db/Sqlite.ts";
import { Database } from "../services/Database.ts";
import { Ids } from "../services/Ids.ts";
import { Saved } from "../services/Saved.ts";
import { layer as savedLayer } from "./savedService.ts";

const PROFILE = "profile-1" as ProfileId;
const SAVED_JOB = "saved-1" as SavedJobId;
const APPLICATION = "application-1" as ApplicationId;

const snapshot = JSON.stringify({
  title: "Baker",
  employerName: "Bakery AS",
  location: "Oslo",
  description: "Bakes bread.",
  applicationUrl: "https://jobs.example.invalid/1",
  publishedAt: "2026-01-01T00:00:00Z",
});

const snapshotWithDeadline = (deadline?: string) =>
  JSON.stringify({
    title: "Baker",
    employerName: "Bakery AS",
    location: "Oslo",
    description: "Bakes bread.",
    applicationUrl: "https://jobs.example.invalid/1",
    publishedAt: "2026-01-01T00:00:00Z",
    ...(deadline === undefined ? {} : { deadline }),
  });

const layer = savedLayer.pipe(
  Layer.provideMerge(
    Layer.mergeAll(layerSqlite(), Layer.succeed(Ids, { next: Effect.succeed("unused") })),
  ),
);
const OTHER_PROFILE = "profile-2" as ProfileId;

const layerWithIds = (values: ReadonlyArray<string>) => {
  let index = 0;
  return savedLayer.pipe(
    Layer.provideMerge(
      Layer.mergeAll(
        layerSqlite(),
        Layer.succeed(Ids, {
          next: Effect.sync(() => values[index++] ?? "unused"),
        }),
      ),
    ),
  );
};

describe("Saved list projection", () => {
  it("returns the active application's id and summary from the real SQLite relation", async () => {
    const page = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const db = yield* Database;
          yield* db.run(
            `INSERT INTO saved_jobs (id, profileId, canonicalJobId, jobSnapshot, note, createdAt, updatedAt)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              SAVED_JOB,
              PROFILE,
              "canonical-1",
              snapshot,
              "",
              "2026-01-01T00:00:00Z",
              "2026-01-01T00:00:00Z",
            ],
          );
          yield* db.run(
            `INSERT INTO applications
               (id, profileId, savedJobId, canonicalJobId, jobSnapshot, method, status,
                applicationUrl, cv, letter, generator, downgradeReason, notes, createdAt, updatedAt)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              APPLICATION,
              PROFILE,
              SAVED_JOB,
              "canonical-1",
              snapshot,
              "assisted",
              "ready",
              "https://jobs.example.invalid/1",
              "CV",
              "Letter",
              "test",
              null,
              "",
              "2026-01-02T00:00:00Z",
              "2026-01-02T00:00:00Z",
            ],
          );
          yield* db.run(
            `INSERT INTO active_applications (savedJobId, profileId, applicationId, updatedAt)
             VALUES (?, ?, ?, ?)`,
            [SAVED_JOB, PROFILE, APPLICATION, "2026-01-02T00:00:00Z"],
          );

          const saved = yield* Saved;
          return yield* saved.list(PROFILE, {
            view: "all",
            sort: "recently-saved",
          });
        }),
        layer,
      ),
    );

    expect(page.data).toHaveLength(1);
    expect(page.data[0]?.currentApplication).toMatchObject({
      id: APPLICATION,
      status: "ready",
      method: "assisted",
      applicationUrl: "https://jobs.example.invalid/1",
    });
    expect(page.data[0]?.priorAttemptCount).toBe(0);
  });
  it("uses the frozen snapshot deadline only when no canonical source row exists", async () => {
    const page = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const db = yield* Database;
          yield* db.run(
            `INSERT INTO saved_jobs (id, profileId, canonicalJobId, jobSnapshot, note, createdAt, updatedAt)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              "saved-fallback",
              "profile-fallback",
              "canonical-missing",
              JSON.stringify({
                title: "Baker",
                employerName: "Bakery AS",
                location: "Oslo",
                description: "Bakes bread.",
                applicationUrl: "https://jobs.example.invalid/fallback",
                publishedAt: "2026-01-01T00:00:00Z",
                deadline: "2020-01-01T00:00:00Z",
              }),
              "",
              "2026-01-01T00:00:00Z",
              "2026-01-01T00:00:00Z",
            ],
          );
          const saved = yield* Saved;
          return yield* saved.list("profile-fallback" as ProfileId, {
            view: "all",
            sort: "recently-saved",
          });
        }),
        layer,
      ),
    );

    expect(page.data[0]?.systemLabels).toContainEqual({
      name: "expired",
      evidence: {
        reference: "saved_jobs:saved-fallback:snapshot:deadline:2020-01-01T00:00:00Z",
        authority: "saved-bookmark",
      },
    });
  });
  it("uses a present canonical deadline instead of an older saved snapshot", async () => {
    const page = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const db = yield* Database;
          yield* db.run(
            `INSERT INTO canonical_jobs
               (id, canonicalKey, title, employerName, location, description, applicationUrl,
                publishedAt, deadline, hydrationTag, statusTag, statusClosedAt, sequence, changedAt,
                sources, titleNormalized, employerNameNormalized, locationNormalized)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              "canonical-source",
              "source-key",
              "Baker",
              "Bakery AS",
              "Oslo",
              "Bakes bread.",
              "https://jobs.example.invalid/source",
              "2026-01-01T00:00:00Z",
              "2099-01-01T00:00:00Z",
              "Hydrated",
              "Closed",
              "2026-01-02T00:00:00Z",
              1,
              "2026-01-01T00:00:00Z",
              "[]",
              "baker",
              "bakery as",
              "oslo",
            ],
          );
          yield* db.run(
            `INSERT INTO saved_jobs (id, profileId, canonicalJobId, jobSnapshot, note, createdAt, updatedAt)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              "saved-source",
              "profile-source",
              "canonical-source",
              JSON.stringify({
                title: "Baker",
                employerName: "Bakery AS",
                location: "Oslo",
                description: "Bakes bread.",
                applicationUrl: "https://jobs.example.invalid/source",
                publishedAt: "2026-01-01T00:00:00Z",
                deadline: "2020-01-01T00:00:00Z",
              }),
              "",
              "2026-01-01T00:00:00Z",
              "2026-01-01T00:00:00Z",
            ],
          );
          const saved = yield* Saved;
          return yield* saved.list("profile-source" as ProfileId, {
            view: "all",
            sort: "recently-saved",
          });
        }),
        layer,
      ),
    );

    expect(page.data[0]?.systemLabels).toEqual([
      {
        name: "saved",
        evidence: { reference: "saved_jobs:saved-source", authority: "saved-bookmark" },
      },
      {
        name: "closed",
        evidence: {
          reference: "canonical_jobs:canonical-source:status",
          authority: "source-corpus",
        },
      },
    ]);
  });
});

describe("Saved custom labels", () => {
  it("creates normalized labels and scopes label listing to the owner", async () => {
    const result = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const saved = yield* Saved;
          const created = yield* saved.createLabel(PROFILE, "  Work   Leads ");
          return {
            created,
            owner: yield* saved.labels(PROFILE),
            other: yield* saved.labels(OTHER_PROFILE),
          };
        }),
        layerWithIds(["label-1"]),
      ),
    );

    expect(result.created).toMatchObject({
      id: "label-1",
      profileId: PROFILE,
      name: "Work Leads",
      normalizedName: "work leads",
    });
    expect(result.owner).toHaveLength(1);
    expect(result.owner[0]).toMatchObject({
      id: "label-1",
      name: "Work Leads",
      normalizedName: "work leads",
    });
    expect(result.other).toEqual([]);
  });

  it("returns typed failures for normalized conflicts and reserved names", async () => {
    const failures = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const saved = yield* Saved;
          yield* saved.createLabel(PROFILE, "Work");
          const conflict = yield* saved.createLabel(PROFILE, "  wORK  ").pipe(Effect.flip);
          const reserved = yield* saved.createLabel(PROFILE, "  SAVED  ").pipe(Effect.flip);
          return { conflict, reserved };
        }),
        layerWithIds(["label-1"]),
      ),
    );

    expect(failures.conflict).toMatchObject({
      _tag: "LabelNameConflict",
      name: "wORK",
      normalizedName: "work",
    });
    expect(failures.reserved).toEqual(new ReservedLabelMutation({ name: "SAVED" }));
  });

  it("renames, deletes, and rejects mutations for a label owned by another profile", async () => {
    const result = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const db = yield* Database;
          const saved = yield* Saved;
          const first = yield* saved.createLabel(PROFILE, "Alpha");
          const second = yield* saved.createLabel(PROFILE, "Beta");
          const foreign = yield* saved.createLabel(OTHER_PROFILE, "Foreign");
          const conflict = yield* saved.renameLabel(PROFILE, first.id, "  beta ").pipe(Effect.flip);
          const reserved = yield* saved
            .renameLabel(PROFILE, first.id, "  CLOSED ")
            .pipe(Effect.flip);
          const missingRename = yield* saved
            .renameLabel(PROFILE, foreign.id, "Owned")
            .pipe(Effect.flip);
          const renamed = yield* saved.renameLabel(PROFILE, first.id, "  Alpha   Renamed ");
          const missingDelete = yield* saved.deleteLabel(PROFILE, foreign.id).pipe(Effect.flip);

          yield* db.run(
            `INSERT INTO saved_jobs
               (id, profileId, canonicalJobId, jobSnapshot, note, createdAt, updatedAt)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              SAVED_JOB,
              PROFILE,
              "canonical-label",
              snapshot,
              "",
              "2026-01-01T00:00:00Z",
              "2026-01-01T00:00:00Z",
            ],
          );
          yield* saved.setLabels(PROFILE, SAVED_JOB, [renamed.id, second.id]);
          yield* saved.deleteLabel(PROFILE, renamed.id);
          const remaining = yield* saved.labels(PROFILE);
          const assignments = yield* db.query<{ readonly labelId: string }>(
            "SELECT labelId FROM label_assignments WHERE profileId = ? AND savedJobId = ?",
            [PROFILE, SAVED_JOB],
          );
          return {
            conflict,
            reserved,
            missingRename,
            missingDelete,
            renamed,
            remaining,
            assignments,
          };
        }),
        layerWithIds(["label-1", "label-2", "foreign-label"]),
      ),
    );

    expect(result.conflict).toEqual(
      new LabelNameConflict({ name: "beta", normalizedName: "beta" }),
    );
    expect(result.reserved).toEqual(new ReservedLabelMutation({ name: "CLOSED" }));
    expect(result.missingRename).toEqual(new CustomLabelMissing({ label: "foreign-label" }));
    expect(result.missingDelete).toEqual(new CustomLabelMissing({ label: "foreign-label" }));
    expect(result.renamed).toMatchObject({
      id: "label-1",
      name: "Alpha Renamed",
      normalizedName: "alpha renamed",
    });
    expect(result.remaining).toHaveLength(1);
    expect(result.remaining[0]).toMatchObject({ id: "label-2", name: "Beta" });
    expect(result.assignments).toEqual([{ labelId: "label-2" }]);
  });
});

describe("Saved label assignments", () => {
  it("replaces assignments and enforces saved-job and label ownership", async () => {
    const result = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const db = yield* Database;
          const saved = yield* Saved;
          const labelA = "label-a" as CustomLabelId;
          const labelB = "label-b" as CustomLabelId;
          const foreignLabel = "label-foreign" as CustomLabelId;
          const addSaved = (id: SavedJobId, profile: ProfileId) =>
            db.run(
              `INSERT INTO saved_jobs
                 (id, profileId, canonicalJobId, jobSnapshot, note, createdAt, updatedAt)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [
                id,
                profile,
                `canonical-${id}`,
                snapshot,
                "",
                "2026-01-01T00:00:00Z",
                "2026-01-01T00:00:00Z",
              ],
            );
          const addLabel = (id: CustomLabelId, profile: ProfileId, name: string) =>
            db.run(
              `INSERT INTO custom_labels
                 (id, profileId, name, normalizedName, createdAt, updatedAt)
               VALUES (?, ?, ?, ?, ?, ?)`,
              [
                id,
                profile,
                name,
                name.toLocaleLowerCase(),
                "2026-01-01T00:00:00Z",
                "2026-01-01T00:00:00Z",
              ],
            );

          yield* addSaved(SAVED_JOB, PROFILE);
          yield* addSaved("foreign-saved" as SavedJobId, OTHER_PROFILE);
          yield* addLabel(labelA, PROFILE, "Alpha");
          yield* addLabel(labelB, PROFILE, "Beta");
          yield* addLabel(foreignLabel, OTHER_PROFILE, "Foreign");

          yield* saved.setLabels(PROFILE, SAVED_JOB, [labelA, labelB, labelA]);
          const first = yield* saved.list(PROFILE, { view: "all", sort: "recently-saved" });
          yield* saved.setLabels(PROFILE, SAVED_JOB, [labelB]);
          const second = yield* saved.list(PROFILE, { view: "all", sort: "recently-saved" });
          const filtered = yield* saved.list(PROFILE, {
            view: "all",
            sort: "recently-saved",
            label: labelB,
          });
          const missingSaved = yield* saved
            .setLabels(PROFILE, "foreign-saved" as SavedJobId, [])
            .pipe(Effect.flip);
          const missingLabel = yield* saved
            .setLabels(PROFILE, SAVED_JOB, [foreignLabel])
            .pipe(Effect.flip);
          const reserved = yield* saved
            .setLabels(PROFILE, SAVED_JOB, ["saved" as CustomLabelId])
            .pipe(Effect.flip);
          const assignments = yield* db.query<{ readonly labelId: string }>(
            "SELECT labelId FROM label_assignments WHERE profileId = ? AND savedJobId = ? ORDER BY labelId",
            [PROFILE, SAVED_JOB],
          );
          return {
            first: first.data[0]?.customLabelIds,
            second: second.data[0]?.customLabelIds,
            filtered: filtered.data.map((item) => item.savedJobId),
            missingSaved,
            missingLabel,
            reserved,
            assignments,
          };
        }),
        layer,
      ),
    );

    expect(result.first).toEqual(expect.arrayContaining(["label-a", "label-b"]));
    expect(result.first).toHaveLength(2);
    expect(result.second).toEqual(["label-b"]);
    expect(result.filtered).toEqual([SAVED_JOB]);
    expect(result.missingSaved).toEqual(new SavedJobMissing({ savedJob: "foreign-saved" }));
    expect(result.missingLabel).toEqual(new CustomLabelMissing({ label: "label-foreign" }));
    expect(result.reserved).toEqual(new ReservedLabelMutation({ name: "saved" }));
  });
});

describe("Saved views, sorting, and pages", () => {
  it("applies system-label presets and each supported sort", async () => {
    const result = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const db = yield* Database;
          const saved = yield* Saved;
          const addSaved = (id: string, createdAt: string, updatedAt: string, deadline?: string) =>
            db.run(
              `INSERT INTO saved_jobs
                 (id, profileId, canonicalJobId, jobSnapshot, note, createdAt, updatedAt)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [
                id,
                PROFILE,
                `canonical-${id}`,
                snapshotWithDeadline(deadline),
                "",
                createdAt,
                updatedAt,
              ],
            );
          const addApplication = (
            savedJobId: string,
            applicationId: string,
            status: "ready" | "submitted" | "withdrawn",
            createdAt: string,
            updatedAt: string,
          ) =>
            db.run(
              `INSERT INTO applications
                 (id, profileId, savedJobId, canonicalJobId, jobSnapshot, method, status,
                  applicationUrl, cv, letter, generator, downgradeReason, notes, createdAt, updatedAt)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                applicationId,
                PROFILE,
                savedJobId,
                `canonical-${savedJobId}`,
                snapshot,
                "assisted",
                status,
                "https://jobs.example.invalid/apply",
                "CV",
                "Letter",
                "template",
                null,
                "",
                createdAt,
                updatedAt,
              ],
            );

          yield* addSaved("no-action", "2026-01-03T00:00:00Z", "2026-01-04T00:00:00Z");
          yield* addSaved(
            "ready",
            "2026-01-02T00:00:00Z",
            "2026-01-05T00:00:00Z",
            "2090-01-01T00:00:00Z",
          );
          yield* addSaved(
            "submitted",
            "2026-01-01T00:00:00Z",
            "2026-01-06T00:00:00Z",
            "2091-01-01T00:00:00Z",
          );
          yield* addSaved(
            "expired",
            "2026-01-04T00:00:00Z",
            "2026-01-02T00:00:00Z",
            "2020-01-01T00:00:00Z",
          );
          yield* addSaved(
            "closed",
            "2026-01-05T00:00:00Z",
            "2026-01-01T00:00:00Z",
            "2092-01-01T00:00:00Z",
          );
          yield* addApplication(
            "ready",
            "application-ready",
            "ready",
            "2026-01-02T00:00:00Z",
            "2026-01-05T00:00:00Z",
          );
          yield* addApplication(
            "submitted",
            "application-submitted",
            "submitted",
            "2026-01-01T00:00:00Z",
            "2026-01-06T00:00:00Z",
          );
          yield* addApplication(
            "submitted",
            "application-prior",
            "withdrawn",
            "2025-12-01T00:00:00Z",
            "2025-12-02T00:00:00Z",
          );
          yield* db.run(
            `INSERT INTO active_applications (savedJobId, profileId, applicationId, updatedAt)
             VALUES (?, ?, ?, ?)`,
            ["ready", PROFILE, "application-ready", "2026-01-05T00:00:00Z"],
          );
          yield* db.run(
            `INSERT INTO active_applications (savedJobId, profileId, applicationId, updatedAt)
             VALUES (?, ?, ?, ?)`,
            ["submitted", PROFILE, "application-submitted", "2026-01-06T00:00:00Z"],
          );
          yield* db.run(
            `INSERT INTO canonical_jobs
               (id, canonicalKey, title, employerName, location, description, applicationUrl,
                publishedAt, deadline, hydrationTag, statusTag, statusClosedAt, sequence, changedAt,
                sources, titleNormalized, employerNameNormalized, locationNormalized)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              "canonical-closed",
              "closed-key",
              "Baker",
              "Bakery AS",
              "Oslo",
              "Bakes bread.",
              "https://jobs.example.invalid/closed",
              "2026-01-01T00:00:00Z",
              "2092-01-01T00:00:00Z",
              "Hydrated",
              "Closed",
              "2026-01-02T00:00:00Z",
              1,
              "2026-01-01T00:00:00Z",
              "[]",
              "baker",
              "bakery as",
              "oslo",
            ],
          );
          yield* db.run("UPDATE saved_jobs SET canonicalJobId = ? WHERE id = ? AND profileId = ?", [
            "canonical-closed",
            "closed",
            PROFILE,
          ]);

          const all = yield* saved.list(PROFILE, { view: "all", sort: "recently-saved" });
          const active = yield* saved.list(PROFILE, { view: "active", sort: "recently-saved" });
          const needsAction = yield* saved.list(PROFILE, {
            view: "needs-action",
            sort: "recently-saved",
          });
          const applied = yield* saved.list(PROFILE, { view: "applied", sort: "recently-saved" });
          const closed = yield* saved.list(PROFILE, { view: "closed", sort: "recently-saved" });
          const deadline = yield* saved.list(PROFILE, { view: "all", sort: "deadline-soon" });
          const updated = yield* saved.list(PROFILE, { view: "all", sort: "recently-updated" });
          return {
            all: all.data.map((item) => item.savedJobId),
            active: active.data.map((item) => item.savedJobId),
            needsAction: needsAction.data.map((item) => item.savedJobId),
            applied: applied.data.map((item) => item.savedJobId),
            closed: closed.data.map((item) => item.savedJobId),
            deadline: deadline.data.map((item) => item.savedJobId),
            updated: updated.data.map((item) => item.savedJobId),
            submittedPrior: all.data.find((item) => item.savedJobId === "submitted")
              ?.priorAttemptCount,
          };
        }),
        layer,
      ),
    );

    expect(result.all).toEqual(["closed", "expired", "no-action", "ready", "submitted"]);
    expect(result.active).toEqual(["no-action", "ready", "submitted"]);
    expect(result.needsAction).toEqual(["closed", "expired", "no-action", "ready"]);
    expect(result.applied).toEqual(["submitted"]);
    expect(result.closed).toEqual(["closed", "expired"]);
    expect(result.deadline).toEqual(["expired", "ready", "submitted", "closed", "no-action"]);
    expect(result.updated).toEqual(["submitted", "ready", "no-action", "expired", "closed"]);
    expect(result.submittedPrior).toBe(1);
  });

  it("returns at most fifty saved jobs and advances by the opaque cursor", async () => {
    const result = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const db = yield* Database;
          const saved = yield* Saved;
          yield* db.run(
            `WITH RECURSIVE numbers(n) AS (
               SELECT 1
               UNION ALL
               SELECT n + 1 FROM numbers WHERE n < 51
             )
             INSERT INTO saved_jobs
               (id, profileId, canonicalJobId, jobSnapshot, note, createdAt, updatedAt)
             SELECT
               'page-' || n,
               ?,
               'canonical-page-' || n,
               ?,
               '',
               '2026-01-01T00:00:' || printf('%02d', n) || 'Z',
               '2026-01-01T00:00:' || printf('%02d', n) || 'Z'
             FROM numbers`,
            [PROFILE, snapshot],
          );
          const first = yield* saved.list(PROFILE, {
            view: "all",
            sort: "recently-saved",
          });
          const second = yield* saved.list(PROFILE, {
            view: "all",
            sort: "recently-saved",
            cursor: "50",
          });
          const invalid = yield* saved.list(PROFILE, {
            view: "all",
            sort: "recently-saved",
            cursor: "not-a-number",
          });
          return { first, second, invalid };
        }),
        layer,
      ),
    );

    expect(result.first.data).toHaveLength(50);
    expect(result.first.data[0]?.savedJobId).toBe("page-51");
    expect(result.first.data[49]?.savedJobId).toBe("page-2");
    expect(result.first.meta).toEqual({ limit: 50, nextCursor: "50" });
    expect(result.second.data.map((item) => item.savedJobId)).toEqual(["page-1"]);
    expect(result.second.meta).toEqual({ limit: 50, nextCursor: null });
    expect(result.invalid.data[0]?.savedJobId).toBe("page-51");
  });
});
