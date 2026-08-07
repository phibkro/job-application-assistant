import { describe, expect, it } from "vitest";
import * as node_fs from "node:fs";
import * as node_path from "node:path";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as OptionMod from "effect/Option";
import { Answer } from "@job-index/domain/Answer";
import { Session } from "@job-index/domain/Access";
import { ApplicationRecord, SavedJob } from "@job-index/domain/Applications";
import { Submission } from "@job-index/domain/Delivery";
import { Freshness, Judgement } from "@job-index/domain/Freshness";
import { Subscription } from "@job-index/domain/Subscription";
import type { JobSnapshot } from "@job-index/domain/Job";
import { Database } from "../services/Database.ts";
import { eraseProfile, ERASED_TABLES, RETAINED_TABLES_WITH_PROFILE_ID } from "./Erase.ts";
import * as Answers from "./repositories/Answers.ts";
import * as Sessions from "./repositories/Sessions.ts";
import * as ApplicationRecords from "../applications/applicationRecords.ts";
import * as SavedJobRows from "../applications/savedJobs.ts";
import * as Submissions from "./repositories/Submissions.ts";
import * as Judgements from "./repositories/Judgements.ts";
import * as FreshnessRows from "./repositories/Freshness.ts";
import * as Subscriptions from "./repositories/Subscriptions.ts";
import { runTest as run } from "./TestLayer.ts";

const now = DateTime.nowUnsafe();

/**
 * Every table in the generated schema that has a `profileId` column,
 * derived by reading `db/schema.sql` itself rather than typed out here —
 * the same reason `Erase.ts`'s `ERASED_TABLES` is generated from `purges`
 * rather than restated. A table gains a `profileId` column and this list
 * picks it up on the next test run without anyone updating this file.
 */
const profileTablesInSchema = (): ReadonlyArray<string> => {
  const schemaPath = node_path.resolve(import.meta.dirname, "../../../../db/schema.sql");
  const schema = node_fs.readFileSync(schemaPath, "utf8");
  const tables: Array<string> = [];
  const tablePattern = /CREATE TABLE IF NOT EXISTS (\w+) \(\n([\s\S]*?)\n\);/g;
  for (const match of schema.matchAll(tablePattern)) {
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

/**
 * One row in every table `ERASED_TABLES` names, for one profile — a
 * realistic account: a saved job, an application prepared from it,
 * submission and judgement history, answers, a session, freshness, and a
 * subscription. Returns nothing; the point is the row existing, not its
 * content.
 */
const seedAccount = (profileId: string) =>
  Effect.gen(function* () {
    yield* Sessions.insert(
      new Session({
        id: `${profileId}-session`,
        principalId: "principal-1" as never,
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
  });

/** Every row this table holds for this profile — generic, so it works for any table `ERASED_TABLES` names. */
const countFor = (table: string, profileId: string) =>
  Effect.gen(function* () {
    const db = yield* Database;
    const rows = yield* db.query<{ n: number }>(
      `SELECT COUNT(*) AS n FROM ${table} WHERE profileId = ?`,
      [profileId],
    );
    return rows[0]?.n ?? 0;
  });

describe("eraseProfile", () => {
  it("ERASED_TABLES plus the documented exclusions account for every profileId-bearing table in the schema", () => {
    const covered = [...ERASED_TABLES, ...RETAINED_TABLES_WITH_PROFILE_ID].toSorted();
    // A new table with a `profileId` column that is in neither list fails
    // here — the property the operator asked this test to have: a table
    // nobody classified is a defect this assertion catches, not a table
    // this suite silently never looked at.
    expect(profileTablesInSchema()).toEqual(covered);
  });

  it("removes every ERASED_TABLES row for the erased profile, leaving another profile's rows untouched", async () => {
    const counts = await run(
      Effect.gen(function* () {
        yield* seedAccount("erase-me");
        yield* seedAccount("keep-me");

        yield* eraseProfile("erase-me" as never);

        const erasedCounts: Record<string, number> = {};
        const keptCounts: Record<string, number> = {};
        for (const table of ERASED_TABLES) {
          erasedCounts[table] = yield* countFor(table, "erase-me");
          keptCounts[table] = yield* countFor(table, "keep-me");
        }
        return { erased: erasedCounts, kept: keptCounts };
      }),
    );

    for (const table of ERASED_TABLES) {
      expect([table, counts.erased[table]]).toEqual([table, 0]);
      // Not a blanket wipe: `keep-me`'s row in the same table must survive.
      expect([table, counts.kept[table]]).toEqual([table, 1]);
    }
  });
});
