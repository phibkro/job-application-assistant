import { describe, expect, it } from "vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as OptionMod from "effect/Option";
import { Answer } from "@job-index/domain/Answer";
import { Session } from "@job-index/domain/Access";
import {
  ActiveApplication,
  ApplicationRecord,
  CustomLabel,
  LabelAssignment,
  SavedJob,
} from "@job-index/domain/Applications";
import { Submission } from "@job-index/domain/Delivery";
import { Freshness, Judgement } from "@job-index/domain/Freshness";
import { Proposal } from "@job-index/domain/Proposals";
import { StudioDocument } from "@job-index/domain/Documents";
import { Subscription } from "@job-index/domain/Subscription";
import type { JobSnapshot } from "@job-index/domain/Job";
import { Database } from "../services/Database.ts";
import { ERASED_TABLES } from "./Erase.ts";
// Raw text, not a runtime file read: this test runs inside workerd, which
// has no filesystem — see `testSupport/workerdEnv.d.ts`.
// @ts-expect-error typed ambiently in workerdEnv.d.ts
import schemaSql from "../../../../db/schema.sql?raw";
import { revokeAllForProfileWrite } from "./repositories/Principals.ts";
import { tombstoneWrite } from "../accounts/profileRow.ts";
import { purgeWritesFor } from "./Erase.ts";
import type { ProfileId } from "@job-index/domain/Ids";
import { runTest as run } from "./TestLayer.ts";

const now = DateTime.nowUnsafe();

/**
 * WS-0019 (d): the deletion sweep composes principal revocation, the full
 * purge batch, and the tombstone into ONE `db.atomic` batch. This test seeds
 * the same realistic account `Erase.test.ts` does plus a principals row,
 * runs the composed batch exactly as the handler does, and proves zero
 * surviving owner rows, an intact control profile, a `Purged` tombstone,
 * revoked principals, and single-batch atomicity.
 */

const profileTablesInSchema = (): ReadonlyArray<string> => {
  const tables: Array<string> = [];
  const tablePattern = /CREATE TABLE IF NOT EXISTS (\w+) \(\n([\s\S]*?)\n\);/g;
  for (const match of schemaSql.matchAll(tablePattern)) {
    const [, table, body] = match;
    if (table !== undefined && body !== undefined && /^\s*profileId\s/m.test(body)) {
      tables.push(table);
    }
  }
  return tables.toSorted();
};

const snapshot: JobSnapshot = {
  title: "Baker",
  employerName: "Bakery AS",
  location: "Oslo",
  description: "Bakes bread.",
  applicationUrl: "https://jobs.example.invalid/1",
  publishedAt: "2026-01-01T00:00:00Z",
};

const seedAccount = (profileId: string) =>
  Effect.gen(function* () {
    const db0 = yield* Database;
    yield* db0.run(
      "INSERT INTO profiles (profileId, cv, erasure, aiAssist, createdAt, updatedAt) VALUES (?, ?, ?, 1, ?, ?)",
      [
        profileId,
        JSON.stringify({ headline: "Old CV" }),
        JSON.stringify({ _tag: "Active" }),
        DateTime.formatIso(now),
        DateTime.formatIso(now),
      ],
    );
    yield* Sessions.insert(
      new Session({
        id: `${profileId}-session`,
        principalId: `${profileId}-principal` as never,
        profileId: profileId as never,
        tokenHash: `${profileId}-hash`,
        expiresAt: Date.now() + 3_600_000,
        createdAt: now,
        revokedAt: OptionMod.none(),
      }),
    );
    yield* Answers.upsert(
      new Answer({
        profileId: profileId as never,
        question: "q" as never,
        label: "L",
        shape: { _tag: "Text" },
        value: "secret",
        origin: "stated",
        createdAt: now,
        updatedAt: now,
      }),
    );
    yield* SavedJobRows.insert(
      new SavedJob({
        id: `${profileId}-saved` as never,
        profileId: profileId as never,
        canonicalJobId: "cj_1" as never,
        jobSnapshot: snapshot,
        note: "",
        createdAt: now,
        updatedAt: now,
      }),
    );
    yield* ApplicationRecords.insert(
      new ApplicationRecord({
        id: `${profileId}-application` as never,
        profileId: profileId as never,
        savedJobId: `${profileId}-saved` as never,
        canonicalJobId: "cj_1" as never,
        jobSnapshot: snapshot,
        method: "assisted",
        status: "ready",
        applicationUrl: snapshot.applicationUrl,
        cv: "CV text",
        letter: "Letter text",
        generator: "template",
        downgradeReason: OptionMod.none(),
        notes: "",
        createdAt: now,
        updatedAt: now,
      }),
    );
    const database = yield* Database;
    const labelWrite = yield* Labels.insertWrite(
      new CustomLabel({
        id: `${profileId}-label` as never,
        profileId: profileId as never,
        name: "Follow up",
        normalizedName: "follow up",
        createdAt: now,
        updatedAt: now,
      }),
    );
    const assignmentWrite = yield* Labels.assignmentWrite(
      new LabelAssignment({
        profileId: profileId as never,
        savedJobId: `${profileId}-saved` as never,
        labelId: `${profileId}-label` as never,
        createdAt: now,
      }),
    );
    const activeWrite = yield* ActiveApplications.insertWrite(
      new ActiveApplication({
        savedJobId: `${profileId}-saved` as never,
        profileId: profileId as never,
        applicationId: `${profileId}-application` as never,
        updatedAt: now,
      }),
    );
    yield* database.atomic([labelWrite, assignmentWrite, activeWrite]);
    yield* Submissions.insert(
      new Submission({
        id: `${profileId}-submission` as never,
        profileId: profileId as never,
        platformId: "webcruiter" as never,
        applicationUrl: snapshot.applicationUrl,
        viaTier: { _tag: "Scripted" },
        outcome: "submitted",
        humanIntervened: false,
        unanswered: [],
        detail: "",
        createdAt: now,
      }),
    );
    yield* Judgements.record(
      new Judgement({
        profileId: profileId as never,
        jobId: "cj_1" as never,
        verdict: "dismissed",
        reason: "not a fit",
        createdAt: now,
      }),
    );
    yield* FreshnessRows.upsert(
      new Freshness({ profileId: profileId as never, seenThrough: 0 as never, updatedAt: now }),
    );
    yield* Subscriptions.upsert(
      new Subscription({
        profileId: profileId as never,
        tier: { _tag: "Free" },
        providerRef: "cus_1",
        provider: "stripe",
        updatedAt: now,
      }),
    );
    yield* ProposalsRepo.insert(
      new Proposal({
        id: `${profileId}-proposal` as never,
        profileId: profileId as never,
        sourceKind: "text",
        fieldPath: "skills.0",
        proposedValue: "TypeScript",
        evidenceExcerpt: "Skills: TypeScript",
        confidence: "high",
        engine: "heuristic",
        status: "pending",
        createdAt: now,
        decidedAt: OptionMod.none(),
      }),
    );
    yield* DocumentsRepo.insert(
      new StudioDocument({
        id: `${profileId}-document` as never,
        profileId: profileId as never,
        jobId: OptionMod.none(),
        jobSnapshot: OptionMod.none(),
        kind: "cv",
        engine: "template",
        content: "General CV body",
        createdAt: now,
        updatedAt: now,
      }),
    );
  });

import * as Answers from "./repositories/Answers.ts";
import * as Sessions from "./repositories/Sessions.ts";
import * as ApplicationRecords from "../applications/applicationRecords.ts";
import * as SavedJobRows from "../applications/savedJobs.ts";
import * as ActiveApplications from "../applications/activeApplications.ts";
import * as Labels from "../applications/labels.ts";
import * as Submissions from "./repositories/Submissions.ts";
import * as Judgements from "./repositories/Judgements.ts";
import * as FreshnessRows from "./repositories/Freshness.ts";
import * as Subscriptions from "./repositories/Subscriptions.ts";
import * as ProposalsRepo from "./repositories/Proposals.ts";
import * as DocumentsRepo from "./repositories/Documents.ts";

/** Seed one `principals` row directly: no domain writer exists for provisioning. */
const insertPrincipalRaw = (db: Database["Service"], profileId: string) =>
  db.run(
    "INSERT INTO principals (principalId, profileId, apiKeyHash, revokedAt, createdAt, updatedAt) VALUES (?, ?, ?, NULL, ?, ?)",
    [
      `${profileId}-principal`,
      profileId,
      `${profileId}-key-hash`,
      DateTime.formatIso(now),
      DateTime.formatIso(now),
    ],
  );

const countFor = (table: string, profileId: string) =>
  Effect.gen(function* () {
    const db = yield* Database;
    const rows = yield* db.query<{ n: number }>(
      `SELECT COUNT(*) AS n FROM ${table} WHERE profileId = ?`,
      [profileId],
    );
    return rows[0]?.n ?? 0;
  });

describe("WS-0019 deletion sweep", () => {
  it("the schema-derived coverage property still holds for the composed batch", () => {
    // Every profileId-bearing table is either purged or the documented
    // tombstone/principals survivors.
    expect(profileTablesInSchema().toSorted()).toEqual(
      [...ERASED_TABLES, "principals", "profiles"].toSorted(),
    );
  });

  it("revokes principals, purges every owner row, and tombstones the profile in one batch", async () => {
    const outcome = await run(
      Effect.gen(function* () {
        const db = yield* Database;
        yield* seedAccount("erase-me");
        yield* seedAccount("keep-me");
        yield* insertPrincipalRaw(db, "erase-me");
        yield* insertPrincipalRaw(db, "keep-me");

        let batches = 0;
        const countedAtomic = (writes: Parameters<Database["Service"]["atomic"]>[0]) =>
          Effect.gen(function* () {
            batches += 1;
            yield* db.atomic(writes);
          });

        const atIso = "2026-08-26T12:00:00.000Z";
        const eraseMe = "erase-me" as ProfileId;
        yield* countedAtomic([
          revokeAllForProfileWrite(eraseMe, atIso),
          ...purgeWritesFor(eraseMe),
          tombstoneWrite(eraseMe, atIso),
        ]);

        const erasedCounts: Record<string, number> = {};
        const keptCounts: Record<string, number> = {};
        for (const table of ERASED_TABLES) {
          erasedCounts[table] = yield* countFor(table, "erase-me");
          keptCounts[table] = yield* countFor(table, "keep-me");
        }
        const principals = yield* db.query<{ principalId: string; revokedAt: string | null }>(
          "SELECT principalId, revokedAt FROM principals ORDER BY principalId ASC",
          [],
        );
        const tombstones = yield* db.query<{ cv: string; erasure: string; aiAssist: number }>(
          "SELECT cv, erasure, aiAssist FROM profiles WHERE profileId = 'erase-me'",
          [],
        );
        return {
          batches,
          erasedCounts,
          keptCounts,
          principals,
          tombstones,
          keptProfile: yield* db.query<{ erasure: string }>(
            "SELECT erasure FROM profiles WHERE profileId = 'keep-me'",
            [],
          ),
        };
      }),
    );

    // Exactly one atomic batch carried the whole deletion.
    expect(outcome.batches).toBe(1);
    // Zero surviving owner rows for the erased profile…
    for (const table of ERASED_TABLES) {
      expect([table, outcome.erasedCounts[table]]).toEqual([table, 0]);
      // …while the control profile keeps its row everywhere.
      expect([table, outcome.keptCounts[table]]).toEqual([table, 1]);
    }
    // The erased profile's principals are revoked; the control's are not.
    for (const principal of outcome.principals) {
      if (principal.principalId.startsWith("erase-me")) {
        expect(principal.revokedAt).toBe("2026-08-26T12:00:00.000Z");
      } else {
        expect(principal.revokedAt).toBeNull();
      }
    }
    // The tombstone: empty CV, `Purged` marker, consent zeroed.
    expect(outcome.tombstones).toHaveLength(1);
    const tombstone = outcome.tombstones[0];
    expect(tombstone !== undefined).toBe(true);
    if (tombstone === undefined) return;
    // The empty profile of record — every field blanked, nothing left to erase.
    const emptiedCv = JSON.parse(tombstone.cv);
    expect(emptiedCv.headline).toBe("");
    expect(emptiedCv.skills).toEqual([]);
    expect(emptiedCv.experience).toEqual([]);
    expect(JSON.parse(tombstone.erasure)._tag).toBe("Purged");
    expect(tombstone.aiAssist).toBe(0);
    // The control profile was untouched by the tombstone step.
    expect(JSON.parse(outcome.keptProfile[0]?.erasure ?? "{}")._tag).toBe("Active");
  });
});
