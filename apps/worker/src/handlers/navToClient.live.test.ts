import { describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import {
  make as makeNavAdapter,
  makePrivateNavCredential,
  NAV_PLATFORM_ID,
} from "@job-index/adapters/nav";
import type { CanonicalJob } from "@job-index/domain/Job";
// @ts-expect-error `?raw` is resolved by Vite inside workerd; no ambient JSON `?raw` type exists
import feedPageRaw from "../../../../fixtures/nav/feed-page.json?raw";
// @ts-expect-error same as above
import detailActiveRaw from "../../../../fixtures/nav/detail-active.json?raw";
// @ts-expect-error same pattern as `testSupport/applySchema.ts`'s `db/schema.sql?raw` import
import catalogSeedSql from "../../../../db/catalog-seed.sql?raw";
import { layer as databaseLayer } from "../db/Live.ts";
import * as IngestionGateRepo from "../db/repositories/IngestionGate.ts";
import { layer as acquisitionLayer } from "../acquisition/index.ts";
import { layer as catalogLayer } from "../catalog/index.ts";
import { layer as corpusLayer } from "../corpus/index.ts";
import { layer as hydrationLayer } from "../hydration/index.ts";
import { layer as ingestionLayer } from "../ingestion/index.ts";
import { hydrationLeaseLayer, layer as sourceLeaseLayer } from "../ingestion/SourceLeaseObject.ts";
import { layer as idsLayer } from "../runtime/Ids.ts";
import { Corpus } from "../services/Corpus.ts";
import { Hydration } from "../services/Hydration.ts";
import { Ingestion } from "../services/Ingestion.ts";
import type { RunBudget, RunReport } from "../services/Ingestion.ts";
import { SourceCatalog } from "../services/SourceCatalog.ts";
import worker from "../index.ts";
import { buildHandler } from "./testSupport.ts";

/**
 * WS-0020 (TB-00) characterization: the existing NAV → D1 → public API path,
 * pinned as it behaves at the WorkScope's starting commit. These tests
 * describe CURRENT behaviour, including behaviour RFC 0016 calls a risk; a
 * test whose name says "characterizes" is not a statement that the behaviour
 * is desired. Evidence and gap table: `evidence/WS-0020/README.md`.
 *
 * What is real here, all inside workerd against the generated schema:
 *   - the researched catalogue seed (`db/catalog-seed.sql`) in `source_catalog`;
 *   - the NAV adapter (`packages/adapters/nav`) decoding the checked-in
 *     `fixtures/nav/*.json`, the adapter registry and `Acquisition` layer;
 *   - `Ingestion.collect`, `Corpus`, `Hydration`, D1, and the real
 *     `SourceLeaseObject` Durable Object for both leases;
 *   - for `GET /api/v1/jobs`, the Worker's own default export (`index.ts`
 *     `fetch`: composition root, real service graph, `armsGate`).
 *
 * The one substitution is the NAV `HttpClient` and credential: a scripted
 * client that answers only the NAV URLs below from the fixtures, and dies on
 * any other request, so no test here can reach a network. Layer wiring
 * mirrors `runtime/Layers.ts` `services(env)` except that substitution, and
 * except that no `since` (retention boundary) is passed to the adapter.
 *
 * `GET /api/v1/jobs/:id` is NOT driven through the Worker's default export:
 * on an unhydrated vacancy it fetches NAV detail through the production
 * `FetchHttpClient`, i.e. a real network call. It is driven through
 * `handlers/testSupport.ts`'s `buildHandler` (real API declaration and
 * handlers) over the same real `Corpus`/`Hydration` instead.
 */

const NAV_HOST = "pam-stilling-feed.nav.no";
const FEED_ENTRY = "_feed_entry";

interface FeedEntryJson {
  readonly uuid: string;
  readonly status: string;
  readonly title: string;
  readonly businessName: string;
  readonly municipal: string;
  readonly sistEndret: string;
}
interface FeedItemJson {
  readonly id: string;
  readonly url: string;
  readonly title: string;
  readonly content_text: string;
  readonly date_modified: string;
  readonly [FEED_ENTRY]: FeedEntryJson;
}
interface FeedPageJson {
  readonly version: string;
  readonly title: string;
  readonly feed_url: string;
  readonly next_url?: string;
  readonly id: string;
  readonly next_id?: string;
  readonly items: ReadonlyArray<FeedItemJson>;
}

const FEED_PAGE: FeedPageJson = JSON.parse(feedPageRaw);
const DETAIL_ACTIVE: unknown = JSON.parse(detailActiveRaw);
/** `active-vacancy-1`: ACTIVE, "Technical Support Specialist", Example Technology AS, Oslo. */
const ACTIVE_ITEM = FEED_PAGE.items[0]!;
/** `inactive-vacancy-2`: INACTIVE, filtered by the adapter. */
const INACTIVE_ITEM = FEED_PAGE.items[1]!;

/** The fixture item re-identified as a different NAV advert (new uuid), every other field equal. */
const withUuid = (item: FeedItemJson, uuid: string): FeedItemJson => ({
  ...item,
  id: `entry-${uuid}`,
  url: `/api/v1/feedentry/${uuid}`,
  [FEED_ENTRY]: { ...item[FEED_ENTRY], uuid },
});

/** Page 1 keeps the fixture envelope (`next_url: /api/v1/feed/page-2`) and swaps its items. */
const firstPage = (items: ReadonlyArray<FeedItemJson>): FeedPageJson => ({ ...FEED_PAGE, items });

/** The feed tail: page 2, no `next_url`, nothing on it. Built from the fixture's envelope. */
const TAIL_PAGE: FeedPageJson = {
  version: FEED_PAGE.version,
  title: FEED_PAGE.title,
  feed_url: "/api/v1/feed/page-2",
  id: "page-2",
  items: [],
};

const SEED_FEED_URL = "https://pam-stilling-feed.nav.no/api/v1/feed";

/** What the scripted NAV answers; `firstPage` is reassigned between sweeps. */
interface NavScript {
  firstPage: FeedPageJson;
  readonly requests: Array<string>;
}

const navScript = (items: ReadonlyArray<FeedItemJson>): NavScript => ({
  firstPage: firstPage(items),
  requests: [],
});

const respond = (script: NavScript, url: URL): unknown => {
  if (url.host !== NAV_HOST) return undefined;
  if (url.pathname === "/api/v1/feed") return script.firstPage;
  if (url.pathname === "/api/v1/feed/page-2") return TAIL_PAGE;
  if (url.pathname === "/api/v1/feedentry/active-vacancy-1") return DETAIL_ACTIVE;
  return undefined;
};

/** Never reaches a socket: unscripted URLs die, so a stray request fails the test loudly. */
const scriptedClient = (script: NavScript): HttpClient.HttpClient =>
  HttpClient.make((request, url) =>
    Effect.suspend(() => {
      script.requests.push(url.toString());
      const body = respond(script, url);
      if (body === undefined) {
        return Effect.die(new Error(`WS-0020 scripted NAV: unscripted request ${url.toString()}`));
      }
      return Effect.succeed(
        HttpClientResponse.fromWeb(
          request,
          new Response(JSON.stringify(body), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        ),
      );
    }),
  );

/** `runtime/Layers.ts` `services(env)`'s corpus/acquisition/ingestion/hydration slice. */
const pipelineLayer = (client: HttpClient.HttpClient) => {
  const base = Layer.mergeAll(corpusLayer, catalogLayer, idsLayer).pipe(
    Layer.provideMerge(databaseLayer(env.DB)),
  );
  const acquisition = acquisitionLayer([
    { tier: "Feed", adapter: makeNavAdapter(client, makePrivateNavCredential("fixture-token")) },
  ]);
  const ingestion = ingestionLayer.pipe(
    Layer.provide(acquisition),
    Layer.provide(sourceLeaseLayer(env.SOURCE_LEASE)),
  );
  const hydration = hydrationLayer.pipe(
    Layer.provide(acquisition),
    Layer.provide(hydrationLeaseLayer(env.SOURCE_LEASE)),
  );
  return Layer.provideMerge(Layer.mergeAll(ingestion, hydration), base);
};

/** Enough for a two-page sweep to reach the tail in one run (production's lazy budget is 1 page). */
const SWEEP: RunBudget = {
  maxPages: 10,
  maxObservations: 100,
  maxDurationMs: 10_000,
  leaseRecoveryMs: 60_000,
};

const seedCatalog = async (): Promise<void> => {
  const statement = catalogSeedSql
    .split("\n")
    .filter((line: string) => !line.trim().startsWith("--"))
    .join("\n")
    .trim();
  await env.DB.prepare(statement).run();
};

const resolvePipeline = (script: NavScript) =>
  Effect.runPromise(
    Effect.provide(
      Effect.gen(function* () {
        return {
          ingestion: yield* Ingestion,
          corpus: yield* Corpus,
          hydration: yield* Hydration,
          catalog: yield* SourceCatalog,
        };
      }),
      pipelineLayer(scriptedClient(script)),
    ),
  );

type Pipeline = Awaited<ReturnType<typeof resolvePipeline>>;

const sweep = (pipeline: Pipeline): Promise<RunReport> =>
  Effect.runPromise(pipeline.ingestion.collect(NAV_PLATFORM_ID, SWEEP));

const rows = async <T>(sql: string): Promise<ReadonlyArray<T>> =>
  (await env.DB.prepare(sql).all<T>()).results;

const maxSequence = async (): Promise<number> =>
  (await rows<{ max: number | null }>("SELECT MAX(sequence) AS max FROM canonical_jobs"))[0]?.max ??
  0;

interface OccurrenceRowView {
  readonly id: string;
  readonly canonicalJobId: string;
  readonly sourceId: string;
  readonly platformId: string;
  readonly externalId: string;
  readonly active: number;
  readonly firstSeenAt: string;
  readonly lastSeenAt: string;
}
const occurrences = (): Promise<ReadonlyArray<OccurrenceRowView>> =>
  rows<OccurrenceRowView>(
    "SELECT id, canonicalJobId, sourceId, platformId, externalId, active, firstSeenAt, lastSeenAt " +
      "FROM occurrences ORDER BY externalId",
  );
const canonicalRows = (): Promise<ReadonlyArray<Record<string, unknown>>> =>
  rows<Record<string, unknown>>("SELECT * FROM canonical_jobs ORDER BY id");

/** A `FetchContext` that records what `fetch` hands to `waitUntil`. */
const recordingContext = () => {
  const pending: Array<Promise<unknown>> = [];
  return { pending, ctx: { waitUntil: (promise: Promise<unknown>) => pending.push(promise) } };
};

/** The Worker's real default export, against this file's D1/Durable Object bindings. */
const workerGet = async (path: string, ctx = recordingContext().ctx): Promise<Response> =>
  worker.fetch(new Request(`http://localhost${path}`), env, ctx);

interface JobPageBody {
  readonly data: ReadonlyArray<CanonicalJob>;
  readonly meta: { readonly limit: number; readonly nextCursor: string | null };
}

/** Every public field except the two a change stamps (`sequence`, `changedAt`). */
const withoutChangeStamp = (job: CanonicalJob) => ({
  id: job.id,
  title: job.title,
  employerName: job.employerName,
  location: job.location,
  applicationUrl: job.applicationUrl,
  publishedAt: job.publishedAt,
  status: job.status,
  sources: job.sources,
  hydration: job.hydration,
});

/** The exact public field set of one `CanonicalJob` on the wire (`packages/domain/src/Job.ts`). */
const PUBLIC_JOB_FIELDS = [
  "applicationUrl",
  "changedAt",
  "employerName",
  "hydration",
  "id",
  "location",
  "publishedAt",
  "sequence",
  "sources",
  "status",
  "title",
];

describe("WS-0020 TB-00: NAV fixture → acquisition → ingestion → D1 → public API", () => {
  it("one ACTIVE NAV feed entry reaches GET /api/v1/jobs through the real Worker, with source id 'nav' and the NAV posting URL as its only source reference", async () => {
    await seedCatalog();
    const script = navScript([ACTIVE_ITEM, INACTIVE_ITEM]);
    const pipeline = await resolvePipeline(script);

    const report = await sweep(pipeline);

    // Acquisition: exactly the feed root and the tail page, no detail fetch.
    expect(script.requests).toEqual([
      "https://pam-stilling-feed.nav.no/api/v1/feed?pageSize=5",
      "https://pam-stilling-feed.nav.no/api/v1/feed/page-2?pageSize=5",
    ]);
    expect(report).toMatchObject({
      pages: 2,
      observations: 1, // the INACTIVE entry is filtered by the adapter, never observed
      canonicalChanges: 1,
      cursorBefore: SEED_FEED_URL,
      cursorAfter: SEED_FEED_URL, // a completed sweep resets to the catalogue's feedUrl
      stoppedReason: "reached tail",
    });

    // Storage: one canonical row, one occurrence carrying NAV's own identity.
    const stored = await occurrences();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      sourceId: "nav",
      platformId: "arbeidsplassen-nav",
      externalId: "active-vacancy-1",
      active: 1,
    });
    expect(await canonicalRows()).toHaveLength(1);

    // Public read through the Worker's own fetch.
    const recorded = recordingContext();
    const response = await workerGet("/api/v1/jobs", recorded.ctx);
    expect(response.status).toBe(200);
    const body: JobPageBody = await response.json();
    expect(body.data).toHaveLength(1);
    const job = body.data[0]!;
    expect(Object.keys(job).toSorted()).toEqual(PUBLIC_JOB_FIELDS);
    expect(job).toMatchObject({
      id: stored[0]!.canonicalJobId,
      title: "Technical Support Specialist",
      employerName: "Example Technology AS",
      location: "Oslo",
      status: { _tag: "Active" },
      sequence: 1,
      sources: ["nav"],
      // The only place NAV's advert identity (its uuid) is visible publicly.
      applicationUrl: "https://arbeidsplassen.nav.no/stillinger/stilling/active-vacancy-1",
      publishedAt: "2026-08-05T08:00:00Z",
      hydration: { _tag: "Unhydrated" },
    });
    // Not exposed: occurrence id, platformId, externalId field, first/last seen.
    expect(JSON.stringify(body)).not.toContain(stored[0]!.id);
    expect(JSON.stringify(body)).not.toContain("arbeidsplassen-nav");
    // L2 at the entry point: the public list read arms nothing.
    expect(recorded.pending).toHaveLength(0);
  });

  it("replaying the identical NAV feed observation creates no semantic change: same sequence, same canonical row, same public page, empty change cursor", async () => {
    await seedCatalog();
    const script = navScript([ACTIVE_ITEM]);
    const pipeline = await resolvePipeline(script);

    await sweep(pipeline);
    const sequenceAfterFirst = await maxSequence();
    const canonicalAfterFirst = await canonicalRows();
    const occurrenceAfterFirst = (await occurrences())[0]!;
    const pageAfterFirst = await (await workerGet("/api/v1/jobs")).json();

    const replay = await sweep(pipeline);

    expect(replay).toMatchObject({
      pages: 2,
      observations: 1,
      canonicalChanges: 0,
      stoppedReason: "reached tail",
    });
    expect(replay.highestSequence).toBe(0); // nothing changed in this run
    expect(await maxSequence()).toBe(sequenceAfterFirst);
    expect(await canonicalRows()).toEqual(canonicalAfterFirst);
    expect(await (await workerGet("/api/v1/jobs")).json()).toEqual(pageAfterFirst);
    // A change-cursor client resuming after the first sweep sees nothing new.
    const sinceFirst: JobPageBody = await (
      await workerGet(`/api/v1/jobs?cursor=${sequenceAfterFirst}`)
    ).json();
    expect(sinceFirst.data).toEqual([]);

    // The occurrence is not duplicated; only its liveness heartbeat may move.
    const replayed = await occurrences();
    expect(replayed).toHaveLength(1);
    expect(replayed[0]!.id).toBe(occurrenceAfterFirst.id);
    expect(replayed[0]!.firstSeenAt).toBe(occurrenceAfterFirst.firstSeenAt);
    expect(replayed[0]!.lastSeenAt >= occurrenceAfterFirst.lastSeenAt).toBe(true);
    // Both runs are logged.
    expect(await rows("SELECT platformId FROM ingestion_runs")).toHaveLength(2);
  });

  it("characterizes modification and closure: a feed-text edit advances sequence with no visible field change; NAV marking the entry INACTIVE closes it at the end of the sweep and the public list still returns it as Closed", async () => {
    await seedCatalog();
    const script = navScript([ACTIVE_ITEM]);
    const pipeline = await resolvePipeline(script);

    await sweep(pipeline);
    const [original] = (await (await workerGet("/api/v1/jobs")).json()).data as Array<CanonicalJob>;

    // Modification: only the feed's free text changes (same uuid, same timestamp).
    script.firstPage = firstPage([
      { ...ACTIVE_ITEM, content_text: "Help customers use technical products. Now with on-call." },
    ]);
    const modified = await sweep(pipeline);
    expect(modified.canonicalChanges).toBe(1); // UpdatedCanonical
    const [updated] = (await (await workerGet("/api/v1/jobs")).json()).data as Array<CanonicalJob>;
    expect(updated!.id).toBe(original!.id);
    expect(updated!.sequence).toBe(original!.sequence + 1);
    // The feed text is folded into the fingerprint only; a summary listing
    // stays Unhydrated, so the public row differs in sequence/changedAt alone.
    expect(withoutChangeStamp(updated!)).toEqual(withoutChangeStamp(original!));

    // Closure: NAV now reports the same entry as INACTIVE.
    script.firstPage = firstPage([
      { ...ACTIVE_ITEM, [FEED_ENTRY]: { ...ACTIVE_ITEM[FEED_ENTRY], status: "INACTIVE" } },
    ]);
    const closing = await sweep(pipeline);
    expect(closing).toMatchObject({
      observations: 0,
      canonicalChanges: 1, // ClosedCanonical, via closeAbsent at the tail
      stoppedReason: "reached tail",
    });
    const closedOnly: JobPageBody = await (await workerGet("/api/v1/jobs?status=Closed")).json();
    expect(closedOnly.data).toHaveLength(1);
    expect(closedOnly.data[0]!.status._tag).toBe("Closed");
    expect(closedOnly.data[0]!.sequence).toBe(updated!.sequence + 1);
    // The unfiltered public list still returns the closed vacancy.
    const all: JobPageBody = await (await workerGet("/api/v1/jobs")).json();
    expect(all.data.map((job) => job.status._tag)).toEqual(["Closed"]);
    expect((await occurrences())[0]!.active).toBe(0);
  });

  it("characterizes known identity risk D05 (not desired behaviour): two NAV adverts with different externalId but equal title/employer/location share one canonicalJobId — one canonical_jobs row, two occurrences, one public job", async () => {
    await seedCatalog();
    const secondRequisition = withUuid(ACTIVE_ITEM, "active-vacancy-1-second-requisition");
    const script = navScript([ACTIVE_ITEM, secondRequisition]);
    const pipeline = await resolvePipeline(script);

    const report = await sweep(pipeline);
    expect(report.observations).toBe(2);
    // CreatedCanonical + AddedDuplicateOccurrence: both count as changes.
    expect(report.canonicalChanges).toBe(2);

    const stored = await occurrences();
    expect(stored.map((row) => row.externalId)).toEqual([
      "active-vacancy-1",
      "active-vacancy-1-second-requisition",
    ]);
    expect(stored[0]!.id).not.toBe(stored[1]!.id);
    expect(stored[0]!.canonicalJobId).toBe(stored[1]!.canonicalJobId);
    expect(await canonicalRows()).toHaveLength(1);

    const body: JobPageBody = await (await workerGet("/api/v1/jobs")).json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0]!.sources).toEqual(["nav"]);
    expect(body.data[0]!.sequence).toBe(2); // the duplicate occurrence advanced it
    // The second requisition's NAV identity is not visible anywhere publicly.
    expect(JSON.stringify(body)).toContain("active-vacancy-1");
    expect(JSON.stringify(body)).not.toContain("second-requisition");

    // Consequence: NAV dropping one of the two requisitions is not a public change.
    const sequenceBefore = await maxSequence();
    script.firstPage = firstPage([ACTIVE_ITEM]);
    const dropped = await sweep(pipeline);
    expect(dropped.canonicalChanges).toBe(0);
    expect(await maxSequence()).toBe(sequenceBefore);
    expect((await occurrences()).map((row) => row.active)).toEqual([1, 0]);
    const after: JobPageBody = await (await workerGet("/api/v1/jobs")).json();
    expect(after.data[0]!.status._tag).toBe("Active");
  });

  it("characterizes GET /api/v1/jobs/:id as not read-only: opening an unhydrated NAV vacancy fetches NAV detail once and rewrites applicationUrl in D1 without advancing sequence", async () => {
    await seedCatalog();
    const script = navScript([ACTIVE_ITEM]);
    const pipeline = await resolvePipeline(script);
    await sweep(pipeline);
    const [before] = (await (await workerGet("/api/v1/jobs")).json()).data as Array<CanonicalJob>;
    const requestsBeforeOpen = script.requests.length;

    const { handler } = buildHandler({
      corpus: Layer.succeed(Corpus, pipeline.corpus),
      hydration: Layer.succeed(Hydration, pipeline.hydration),
      sourceCatalog: Layer.succeed(SourceCatalog, pipeline.catalog),
    });
    const opened = await handler(new Request(`http://localhost/api/v1/jobs/${before!.id}`));
    expect(opened.status).toBe(200);
    const job: CanonicalJob = await opened.json();

    expect(script.requests.slice(requestsBeforeOpen)).toEqual([
      "https://pam-stilling-feed.nav.no/api/v1/feedentry/active-vacancy-1",
    ]);
    expect(job.hydration).toEqual({
      _tag: "Hydrated",
      description: "Help customers use technical products.",
      deadline: "2026-08-25",
    });
    // The NAV posting URL is replaced by the employer's URL, tracking param intact.
    expect(job.applicationUrl).toBe("https://careers.example/jobs/100?utm_source=nav");
    expect(job.sources).toEqual(["nav"]);
    expect(job.sequence).toBe(before!.sequence);
    expect(job.changedAt).toBe(before!.changedAt);

    // The write is persisted and visible on the public list, still unsequenced,
    // so a change-cursor client never learns of it.
    const listed: JobPageBody = await (await workerGet("/api/v1/jobs")).json();
    expect(listed.data[0]!.applicationUrl).toBe("https://careers.example/jobs/100?utm_source=nav");
    expect(JSON.stringify(listed)).not.toContain("active-vacancy-1");
    const sinceBefore: JobPageBody = await (
      await workerGet(`/api/v1/jobs?cursor=${before!.sequence}`)
    ).json();
    expect(sinceBefore.data).toEqual([]);

    // Second open: already settled, no further upstream request.
    const requestsAfterFirstOpen = script.requests.length;
    await handler(new Request(`http://localhost/api/v1/jobs/${before!.id}`));
    expect(script.requests.length).toBe(requestsAfterFirstOpen);
  });

  it("characterizes armsGate at the real Worker entry point: /api/v1/jobs and /api/v1/jobs/:id never arm lazy ingestion; /api/v1/me/feed and /api/v1/me/matches/:id arm it even when the request is unauthenticated (401)", async () => {
    // A fresh marker keeps any armed gate inside its floor (WithinFloor), so
    // nothing below can reach Ingestion.collect or NAV; the catalogue is also
    // left empty in this test as a second guard.
    const nowIso = new Date().toISOString();
    await Effect.runPromise(
      Effect.provide(
        IngestionGateRepo.claim(NAV_PLATFORM_ID, nowIso, "1970-01-01T00:00:00.000Z"),
        databaseLayer(env.DB),
      ),
    );
    const marker = async () =>
      (await rows<{ lastAttemptAt: string }>("SELECT lastAttemptAt FROM ingestion_gate"))[0]
        ?.lastAttemptAt;
    expect(await marker()).toBe(nowIso);

    const cases = [
      { path: "/api/v1/jobs", status: 200, arms: 0 },
      { path: "/api/v1/jobs/cj_0000000000000000", status: 404, arms: 0 },
      { path: "/api/v1/sources/catalog", status: 200, arms: 0 },
      { path: "/api/v1/me/feed", status: 401, arms: 1 },
      { path: "/api/v1/me/matches/cj_0000000000000000", status: 401, arms: 1 },
    ];
    const observed: Array<{ path: string; status: number; arms: number }> = [];
    for (const { path } of cases) {
      const recorded = recordingContext();
      // eslint-disable-next-line no-await-in-loop -- sequential by design; each case reads its own context
      const response = await workerGet(path, recorded.ctx);
      // eslint-disable-next-line no-await-in-loop -- let any armed gate settle before the next request
      await Promise.all(recorded.pending);
      observed.push({ path, status: response.status, arms: recorded.pending.length });
    }
    expect(observed).toEqual(cases);
    // The armed attempts were inside the floor: the marker is untouched.
    expect(await marker()).toBe(nowIso);
  });
});
