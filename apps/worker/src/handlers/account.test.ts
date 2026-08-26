import { describe, expect, it } from "vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Context from "effect/Context";
import * as Option from "effect/Option";
import { Answer } from "@job-index/domain/Answer";
import { Session, type Credential } from "@job-index/domain/Access";
import {
  ActiveApplication,
  ApplicationRecord,
  CustomLabel,
  LabelAssignment,
  SavedJob,
} from "@job-index/domain/Applications";
import { Submission } from "@job-index/domain/Delivery";
import { StudioDocument } from "@job-index/domain/Documents";
import { Freshness, Judgement } from "@job-index/domain/Freshness";
import type { JobSnapshot } from "@job-index/domain/Job";
import type { PrincipalId, ProfileId } from "@job-index/domain/Ids";
import { Proposal } from "@job-index/domain/Proposals";
import { Subscription } from "@job-index/domain/Subscription";
import { Accounts } from "../services/Accounts.ts";
import { Database, type Write } from "../services/Database.ts";
import { ERASED_TABLES } from "../db/Erase.ts";
import { emptyProfile } from "../accounts/profileRow.ts";
import * as Answers from "../db/repositories/Answers.ts";
import * as Sessions from "../db/repositories/Sessions.ts";
import * as Submissions from "../db/repositories/Submissions.ts";
import * as Judgements from "../db/repositories/Judgements.ts";
import * as FreshnessRows from "../db/repositories/Freshness.ts";
import * as Subscriptions from "../db/repositories/Subscriptions.ts";
import * as ProposalsRepo from "../db/repositories/Proposals.ts";
import * as DocumentsRepo from "../db/repositories/Documents.ts";
import * as ApplicationRecords from "../applications/applicationRecords.ts";
import * as SavedJobRows from "../applications/savedJobs.ts";
import * as ActiveApplications from "../applications/activeApplications.ts";
import * as Labels from "../applications/labels.ts";
import { buildHandler } from "./testSupport.ts";
import { layerSqlite } from "../db/Sqlite.ts";
import { layer as realAccountsLayer } from "../accounts/accounts.ts";
import { hashFor } from "../accounts/fixtures.ts";

const profileId = "erase-me" as ProfileId;
const credential: Credential = {
  _tag: "Session",
  principal: "erase-me-principal" as PrincipalId,
  session: "erase-me-session",
};
const authHeaders = {
  Authorization: "Bearer deletion-token",
  "Content-Type": "application/json",
};

const snapshot: JobSnapshot = {
  title: "Baker",
  employerName: "Bakery AS",
  location: "Oslo",
  description: "Bakes bread.",
  applicationUrl: "https://jobs.example.invalid/1",
  publishedAt: "2026-01-01T00:00:00Z",
};

const seedCompleteAccount = (
  owner: string,
  sessionHash: string,
  apiKeyHash: string,
  now: DateTime.Utc,
) =>
  Effect.gen(function* () {
    const db = yield* Database;
    const profile = owner as ProfileId;
    const principal = `${owner}-principal` as PrincipalId;
    yield* db.run(
      "INSERT INTO profiles (profileId, cv, erasure, aiAssist, createdAt, updatedAt) VALUES (?, ?, ?, 1, ?, ?)",
      [
        profile,
        JSON.stringify({ headline: `${owner} private CV` }),
        JSON.stringify({ _tag: "Active" }),
        DateTime.formatIso(now),
        DateTime.formatIso(now),
      ],
    );
    yield* db.run(
      "INSERT INTO principals (principalId, profileId, apiKeyHash, revokedAt, createdAt, updatedAt) VALUES (?, ?, ?, NULL, ?, ?)",
      [principal, profile, apiKeyHash, DateTime.formatIso(now), DateTime.formatIso(now)],
    );
    yield* Sessions.insert(
      new Session({
        id: `${owner}-session`,
        principalId: principal,
        profileId: profile,
        tokenHash: sessionHash,
        expiresAt: Date.now() + 3_600_000,
        createdAt: now,
        revokedAt: Option.none(),
      }),
    );
    yield* Answers.upsert(
      new Answer({
        profileId: profile,
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
        id: `${owner}-saved` as never,
        profileId: profile,
        canonicalJobId: "cj_1" as never,
        jobSnapshot: snapshot,
        note: "",
        createdAt: now,
        updatedAt: now,
      }),
    );
    yield* ApplicationRecords.insert(
      new ApplicationRecord({
        id: `${owner}-application` as never,
        profileId: profile,
        savedJobId: `${owner}-saved` as never,
        canonicalJobId: "cj_1" as never,
        jobSnapshot: snapshot,
        method: "assisted",
        status: "ready",
        applicationUrl: snapshot.applicationUrl,
        cv: "CV text",
        letter: "Letter text",
        generator: "template",
        downgradeReason: Option.none(),
        notes: "",
        createdAt: now,
        updatedAt: now,
      }),
    );
    const labelWrite = yield* Labels.insertWrite(
      new CustomLabel({
        id: `${owner}-label` as never,
        profileId: profile,
        name: "Follow up",
        normalizedName: "follow up",
        createdAt: now,
        updatedAt: now,
      }),
    );
    const assignmentWrite = yield* Labels.assignmentWrite(
      new LabelAssignment({
        profileId: profile,
        savedJobId: `${owner}-saved` as never,
        labelId: `${owner}-label` as never,
        createdAt: now,
      }),
    );
    const activeWrite = yield* ActiveApplications.insertWrite(
      new ActiveApplication({
        savedJobId: `${owner}-saved` as never,
        profileId: profile,
        applicationId: `${owner}-application` as never,
        updatedAt: now,
      }),
    );
    yield* db.atomic([labelWrite, assignmentWrite, activeWrite]);
    yield* Submissions.insert(
      new Submission({
        id: `${owner}-submission` as never,
        profileId: profile,
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
        profileId: profile,
        jobId: "cj_1" as never,
        verdict: "dismissed",
        reason: "not a fit",
        createdAt: now,
      }),
    );
    yield* FreshnessRows.upsert(
      new Freshness({ profileId: profile, seenThrough: 0 as never, updatedAt: now }),
    );
    yield* Subscriptions.upsert(
      new Subscription({
        profileId: profile,
        tier: { _tag: "Free" },
        providerRef: `${owner}-customer`,
        provider: "stripe",
        updatedAt: now,
      }),
    );
    yield* ProposalsRepo.insert(
      new Proposal({
        id: `${owner}-proposal` as never,
        profileId: profile,
        sourceKind: "text",
        fieldPath: "skills.0",
        proposedValue: "TypeScript",
        evidenceExcerpt: "Skills: TypeScript",
        confidence: "high",
        engine: "heuristic",
        status: "pending",
        createdAt: now,
        decidedAt: Option.none(),
      }),
    );
    yield* DocumentsRepo.insert(
      new StudioDocument({
        id: `${owner}-document` as never,
        profileId: profile,
        jobId: Option.none(),
        jobSnapshot: Option.none(),
        kind: "cv",
        engine: "template",
        content: "General CV body",
        createdAt: now,
        updatedAt: now,
      }),
    );
  });

const rowsFor = (database: Database["Service"], table: string, owner: string) =>
  Effect.runPromise(
    database.query<Record<string, unknown>>(`SELECT * FROM ${table} WHERE profileId = ?`, [owner]),
  );

const deletionRequest = (token: string) =>
  new Request("http://localhost/api/v1/me/account", {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ confirm: "DELETE" }),
  });

describe("DELETE /api/v1/me/account", () => {
  it("rejects an invalid typed confirmation before effects run", async () => {
    let atomicCalls = 0;
    const { handler } = buildHandler({
      accounts: Layer.succeed(Accounts, {
        authenticate: () => Effect.succeed(credential),
        profileOf: () => Effect.succeed(profileId),
        requestErasure: () => Effect.die("unused"),
      }),
      database: Layer.succeed(Database, {
        query: () => Effect.die("unused"),
        run: () => Effect.die("unused"),
        runAffected: () => Effect.die("unused"),
        atomic: () =>
          Effect.sync(() => {
            atomicCalls += 1;
          }),
        atomicAffected: () => Effect.die("unused"),
      }),
    });

    const response = await handler(
      new Request("http://localhost/api/v1/me/account", {
        method: "DELETE",
        headers: authHeaders,
        body: JSON.stringify({ confirm: "delete" }),
      }),
    );

    expect(response.status).toBe(400);
    expect(atomicCalls).toBe(0);
  });

  it("submits one complete atomic batch and the same token is unauthorized afterwards", async () => {
    let revoked = false;
    const batches: Array<ReadonlyArray<Write>> = [];
    const { handler } = buildHandler({
      accounts: Layer.succeed(Accounts, {
        authenticate: () => Effect.succeed(revoked ? undefined : credential),
        profileOf: () => Effect.succeed(revoked ? undefined : profileId),
        requestErasure: () => Effect.die("unused"),
      }),
      database: Layer.succeed(Database, {
        query: () => Effect.die("unused"),
        run: () => Effect.die("unused"),
        runAffected: () => Effect.die("unused"),
        atomic: (writes) =>
          Effect.sync(() => {
            batches.push(writes);
            revoked = true;
          }),
        atomicAffected: () => Effect.die("unused"),
      }),
    });

    const response = await handler(
      new Request("http://localhost/api/v1/me/account", {
        method: "DELETE",
        headers: authHeaders,
        body: JSON.stringify({ confirm: "DELETE" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ erased: true, at: expect.any(String) });
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(ERASED_TABLES.length + 2);
    expect(batches[0]?.[0]?.sql).toContain("UPDATE principals SET revokedAt");
    expect(batches[0]?.at(-1)?.sql).toContain("UPDATE profiles SET");

    const retry = await handler(
      new Request("http://localhost/api/v1/me/account", {
        method: "DELETE",
        headers: authHeaders,
        body: JSON.stringify({ confirm: "DELETE" }),
      }),
    );
    expect(retry.status).toBe(401);
    expect(batches).toHaveLength(1);
  });
});

describe("DELETE /api/v1/me/account — real HTTP + Accounts + SQLite", () => {
  for (const credentialKind of ["session", "api-key"] as const) {
    it(`real route erases every owner table through ${credentialKind}, revokes both credentials, and preserves the control owner byte-for-byte`, async () => {
      const database = await Effect.runPromise(
        Effect.scoped(
          Effect.map(Layer.build(layerSqlite()), (context) => Context.get(context, Database)),
        ),
      );
      const databaseLayer = Layer.succeed(Database, database);
      const presentedToken = `${credentialKind}-deletion-token`;
      const otherToken =
        credentialKind === "session" ? "owner-other-api-key" : "owner-other-session-token";
      const sessionToken = credentialKind === "session" ? presentedToken : otherToken;
      const apiKeyToken = credentialKind === "api-key" ? presentedToken : otherToken;
      const nowIso = "2026-08-26T12:00:00.000Z";
      const now = DateTime.makeUnsafe(nowIso);
      const sessionHash = await hashFor(sessionToken);
      const apiKeyHash = await hashFor(apiKeyToken);
      const controlSessionHash = await hashFor("control-session-token");
      const controlApiKeyHash = await hashFor("control-api-key");

      await Effect.runPromise(
        Effect.gen(function* () {
          yield* seedCompleteAccount("erase-me", sessionHash, apiKeyHash, now);
          yield* seedCompleteAccount("keep-me", controlSessionHash, controlApiKeyHash, now);
        }).pipe(Effect.provide(databaseLayer)),
      );

      const inspectedTables = [...ERASED_TABLES, "profiles", "principals"];
      const controlBefore = Object.fromEntries(
        await Promise.all(
          inspectedTables.map(async (table) => [table, await rowsFor(database, table, "keep-me")]),
        ),
      );

      const { handler, dispose } = buildHandler({
        accounts: realAccountsLayer.pipe(Layer.provide(databaseLayer)),
        database: databaseLayer,
      });

      try {
        const deleted = await handler(deletionRequest(presentedToken));
        expect(deleted.status).toBe(200);
        expect(await deleted.json()).toEqual({ erased: true, at: expect.any(String) });
        expect((await handler(deletionRequest(presentedToken))).status).toBe(401);
        expect((await handler(deletionRequest(otherToken))).status).toBe(401);

        const erasedRows = await Promise.all(
          ERASED_TABLES.map((table) => rowsFor(database, table, "erase-me")),
        );
        expect(erasedRows).toEqual(ERASED_TABLES.map(() => []));
        const principals = await rowsFor(database, "principals", "erase-me");
        expect(principals).toHaveLength(1);
        expect(principals[0]?.revokedAt).toBeTypeOf("string");
        const profiles = await rowsFor(database, "profiles", "erase-me");
        expect(profiles).toHaveLength(1);
        expect(profiles[0]).toMatchObject({
          cv: JSON.stringify(emptyProfile),
          aiAssist: 0,
        });
        expect(JSON.parse(String(profiles[0]?.erasure))).toMatchObject({ _tag: "Purged" });

        const controlAfter = Object.fromEntries(
          await Promise.all(
            inspectedTables.map(async (table) => [
              table,
              await rowsFor(database, table, "keep-me"),
            ]),
          ),
        );
        expect(controlAfter).toEqual(controlBefore);
      } finally {
        await dispose();
      }
    });
  }
});
