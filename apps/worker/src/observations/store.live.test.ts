import { describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import * as Effect from "effect/Effect";
import { NAV_PLATFORM_ID } from "@job-index/adapters/nav";
import { observationId } from "@job-index/domain/observation/Ir";
import type { CanonicalJob } from "@job-index/domain/Job";
import type { WorkloadSection } from "@job-index/domain/observation/Query";
import { runTest } from "../db/TestLayer.ts";
import type { RunBudget } from "../services/Ingestion.ts";
import worker from "../index.ts";
import * as Projection from "./projection.ts";
import * as Store from "./store.ts";
import {
  ACTIVE_ITEM,
  detail,
  FEED_PAGE,
  feedContents,
  FIFTY,
  INACTIVE_ITEM,
  ingestionFor,
  navScript,
  rows,
  seedCatalog,
  uuidOf,
  withTitle,
  withUuid,
} from "./testSupport.ts";

/**
 * WS-0022 acceptance against the real Worker + D1 (workerd): the trigger guarantee and the one purge path, bounded
 * hydration (option A) through the real ingestion run, rebuild = incremental for the projection, and the experimental
 * workload filter through the Worker's own default export.
 */

const SWEEP: RunBudget = {
  maxPages: 10,
  maxObservations: 100,
  maxDurationMs: 10_000,
  leaseRecoveryMs: 60_000,
};
const recording = { runId: "test-run", recordedAt: "2026-11-01T00:00:00Z" };

const appendOne = () =>
  runTest(
    Effect.gen(function* () {
      const [content] = feedContents(FEED_PAGE);
      yield* Store.append([content!], recording);
      return observationId(content!);
    }),
  );

describe("trigger guarantee: observations are append-only (migration 0006)", () => {
  it("an UPDATE or DELETE on observations fails, and the row is unchanged", async () => {
    const id = await appendOne();
    await expect(
      env.DB.prepare("UPDATE observations SET status = 'INACTIVE' WHERE id = ?").bind(id).run(),
    ).rejects.toThrow(/append-only/);
    await expect(
      env.DB.prepare("DELETE FROM observations WHERE id = ?").bind(id).run(),
    ).rejects.toThrow(/append-only/);
    await expect(env.DB.prepare("DELETE FROM observations").run()).rejects.toThrow(/append-only/);
    expect(await rows("SELECT id, status FROM observations")).toEqual([{ id, status: "ACTIVE" }]);
  });

  it("the one purge path leaves a permanent tombstone, and a replay cannot resurrect the purged content", async () => {
    const id = await appendOne();
    expect(await runTest(Store.purge(id, "lawful erasure (test)", "2026-11-02T00:00:00Z"))).toBe(
      true,
    );
    expect(await rows("SELECT COUNT(*) AS n FROM observations")).toEqual([{ n: 0 }]);
    expect(
      await rows("SELECT observationId, sourceId, externalId, reason FROM observation_tombstones"),
    ).toEqual([
      {
        observationId: id,
        sourceId: "nav",
        externalId: "active-vacancy-1",
        reason: "lawful erasure (test)",
      },
    ]);
    // Replaying the same content is ignored, not re-recorded.
    await appendOne();
    expect(await rows("SELECT COUNT(*) AS n FROM observations")).toEqual([{ n: 0 }]);
    await expect(env.DB.prepare("DELETE FROM observation_tombstones").run()).rejects.toThrow(
      /permanent/,
    );
    await expect(
      env.DB.prepare("UPDATE observation_tombstones SET reason = 'x'").run(),
    ).rejects.toThrow(/permanent/);
  });

  it("control twin: without the triggers the same UPDATE and DELETE succeed, so the guarantee is the triggers'", async () => {
    const id = await appendOne();
    await env.DB.prepare("DROP TRIGGER observations_no_update").run();
    await env.DB.prepare("DROP TRIGGER observations_no_delete").run();
    await env.DB.prepare("UPDATE observations SET status = 'INACTIVE' WHERE id = ?").bind(id).run();
    await env.DB.prepare("DELETE FROM observations WHERE id = ?").bind(id).run();
    expect(await rows("SELECT COUNT(*) AS n FROM observations")).toEqual([{ n: 0 }]);
  });

  it("a malformed row fails loudly instead of being ignored (ON CONFLICT DO NOTHING, not OR IGNORE)", async () => {
    const [content] = feedContents(FEED_PAGE);
    await expect(
      runTest(Store.append([{ ...content!, kind: "Bogus" as never }], recording)),
    ).rejects.toThrow();
  });
});

describe("bounded hydration (option A) through the real ingestion run", () => {
  it("a budget that grants no detail fetches makes none: the WS-0020 request pattern is unchanged", async () => {
    await seedCatalog();
    const script = navScript([ACTIVE_ITEM, INACTIVE_ITEM], [detail("active-vacancy-1")]);
    const report = await Effect.runPromise(
      (await ingestionFor(script)).collect(NAV_PLATFORM_ID, SWEEP),
    );
    expect(script.requests).toEqual([
      "https://pam-stilling-feed.nav.no/api/v1/feed?pageSize=5",
      "https://pam-stilling-feed.nav.no/api/v1/feed/page-2?pageSize=5",
    ]);
    expect(report.detailFetches).toBe(0);
    // Both feed entries are observed, the INACTIVE one included; the workload is TempUnknown (summary only).
    expect(
      await rows("SELECT externalId, kind, status FROM observations ORDER BY recordedSeq"),
    ).toEqual([
      { externalId: "active-vacancy-1", kind: "FeedEntry", status: "ACTIVE" },
      { externalId: "inactive-vacancy-2", kind: "FeedEntry", status: "INACTIVE" },
    ]);
    expect(await rows("SELECT workloadState FROM workload_projection")).toEqual([
      { workloadState: "TempUnknown" },
    ]);
  });

  it("N detail fetches per run, active and not yet hydrated only; measured: 1 feed request + 1 per detail", async () => {
    await seedCatalog();
    const uuids = ["wl-a", "wl-b", "wl-c", "wl-d", "wl-e", "wl-f"];
    const items = uuids.map((uuid, i) => withUuid(withTitle(ACTIVE_ITEM, `Role ${i}`), uuid));
    const details = uuids.map((uuid) => detail(uuid, { append: FIFTY }));
    const script = navScript([...items, INACTIVE_ITEM], details);
    const ingestion = await ingestionFor(script);
    const budget = { ...SWEEP, maxPages: 1, maxDetailFetches: 5 };

    const first = await Effect.runPromise(ingestion.collect(NAV_PLATFORM_ID, budget));
    const detailRequests = script.requests.filter((url) => url.includes("/feedentry/"));
    expect(first.detailFetches).toBe(5);
    expect(detailRequests).toHaveLength(5);
    expect(script.requests).toHaveLength(1 + 5);
    expect(detailRequests.some((url) => url.includes("inactive-vacancy-2"))).toBe(false);

    // The second run fetches only what is left (one), then nothing more is a candidate.
    const second = await Effect.runPromise(ingestion.collect(NAV_PLATFORM_ID, budget));
    expect(second.detailFetches).toBe(1);
    expect(script.requests.filter((url) => url.includes("/feedentry/"))).toHaveLength(6);
    const states = await rows<{ workloadState: string; workloadMin: number }>(
      "SELECT workloadState, workloadMin FROM workload_projection ORDER BY canonicalJobId",
    );
    expect(states).toHaveLength(6);
    expect(states.every((row) => row.workloadState === "Derived" && row.workloadMin === 0.5)).toBe(
      true,
    );
  });

  it("law in D1: the incrementally maintained projection equals a full rebuild", async () => {
    await seedCatalog();
    const script = navScript(
      [ACTIVE_ITEM, withUuid(ACTIVE_ITEM, "second-requisition"), INACTIVE_ITEM],
      [
        detail("active-vacancy-1", { extent: "Heltid" }),
        detail("second-requisition", { append: FIFTY }),
      ],
    );
    const ingestion = await ingestionFor(script);
    await Effect.runPromise(ingestion.collect(NAV_PLATFORM_ID, { ...SWEEP, maxDetailFetches: 1 }));
    await Effect.runPromise(ingestion.collect(NAV_PLATFORM_ID, { ...SWEEP, maxDetailFetches: 1 }));
    const incremental = await runTest(Projection.allRows);
    const rebuilt = await runTest(Projection.rebuild);
    expect(await runTest(Projection.allRows)).toEqual(incremental);
    expect([...rebuilt]).toEqual([...incremental]);
    // T4's D05 merge (pinned by WS-0020): both requisitions are one vacancy, so Heltid and 50 % fuse to Conflicting.
    expect(incremental.map((row) => row.workloadState)).toEqual(["Conflicting"]);
  });
});

interface JobPageBody {
  readonly data: ReadonlyArray<CanonicalJob>;
  readonly meta: { readonly limit: number; readonly nextCursor: string | null };
  readonly workload?: WorkloadSection;
}

const workerGet = async (path: string): Promise<JobPageBody> => {
  const response = await worker.fetch(new Request(`http://localhost${path}`), env, {
    waitUntil: () => undefined,
  });
  expect(response.status).toBe(200);
  return response.json();
};

describe("experimental workload filter on GET /api/v1/jobs, through the real Worker", () => {
  it("groups Oslo vacancies by workload fact state for a 40–60 % query; missing workload is never full-time", async () => {
    await seedCatalog();
    const cases: ReadonlyArray<readonly [string, Record<string, string>]> = [
      // First on the page, so recorded first, so the last hydration candidate (newest-recorded go first).
      ["wl-temp", {}],
      ["wl-50", { append: FIFTY }],
      ["wl-40-80", { append: "Stillingsprosent 40–80 %." }],
      ["wl-100", { extent: "Heltid" }],
      ["wl-negotiable", { append: "Stillingsprosent etter avtale." }],
      ["wl-deltid", { extent: "Deltid" }],
      ["wl-nothing", {}],
      ["wl-conflict", { extent: "Heltid", append: FIFTY }],
    ];
    const items = cases.map(([uuid], i) => withUuid(withTitle(ACTIVE_ITEM, `Role ${i}`), uuid));
    const details = cases
      .filter(([uuid]) => uuid !== "wl-temp")
      .map(([uuid, options]) => detail(uuid, options));
    const script = navScript(items, details);
    const ingestion = await ingestionFor(script);
    // Hydrate everything but `wl-temp`: grant 7 of the 8 candidates.
    await Effect.runPromise(
      ingestion.collect(NAV_PLATFORM_ID, { ...SWEEP, maxPages: 1, maxDetailFetches: 7 }),
    );

    const plain = await workerGet("/api/v1/jobs?location=Oslo");
    expect(plain.workload).toBeUndefined();
    expect(Object.keys(plain).toSorted()).toEqual(["data", "meta"]);

    const body = await workerGet("/api/v1/jobs?location=Oslo&workloadMin=40&workloadMax=60");
    const titleOf = new Map<string, string>(plain.data.map((job) => [job.id, job.title] as const));
    const uuidOfTitle = new Map<string, string>(
      items.map((item, i) => [`Role ${i}`, uuidOf(item)] as const),
    );
    const named = (ids: ReadonlyArray<string>) =>
      ids.map((id) => uuidOfTitle.get(titleOf.get(id) ?? "") ?? id).toSorted();
    const groups = body.workload!.groups;
    expect(body.workload).toMatchObject({
      stability: "experimental",
      method: "workload@1",
      query: { minValue: 0.4, maxValue: 0.6 },
    });
    expect(named(groups.matches)).toEqual(["wl-40-80", "wl-50"]);
    expect(named(groups.negotiable)).toEqual(["wl-negotiable"]);
    expect(named(groups.unsupported)).toEqual(["wl-deltid"]);
    expect(named(groups.unknown)).toEqual(["wl-nothing"]);
    expect(named(groups.conflicting)).toEqual(["wl-conflict"]);
    expect(named(groups.tempUnknown)).toEqual(["wl-temp"]);
    // 100 % is determined and outside 40–60 %: excluded, not listed under any state.
    expect(body.workload!.excluded).toBe(1);
    expect(named(body.data.map((job) => job.id))).not.toContain("wl-100");
    // 40–80 % overlaps and keeps its interval; it is never reported as one value.
    const ranged = body.workload!.facts.find((f) => named([f.id])[0] === "wl-40-80");
    expect(ranged).toEqual({
      id: ranged!.id,
      state: "Derived",
      minValue: 0.4,
      maxValue: 0.8,
      overlap: "overlaps",
    });
    // The job objects themselves are the unchanged public shape.
    expect(
      body.data.every((job) => Object.keys(job).length === Object.keys(plain.data[0]!).length),
    ).toBe(true);
  });
});
