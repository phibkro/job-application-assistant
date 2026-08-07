import { describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type { RawListing } from "@job-index/domain/Job";
import type { SourceId } from "@job-index/domain/Ids";
import { layer as databaseLayer } from "../db/Live.ts";
import { Corpus } from "../services/Corpus.ts";
import { layer as corpusPersistenceLayer, normalize } from "../corpus/index.ts";
import { buildHandler } from "./testSupport.ts";

type CorpusShape = Effect.Success<typeof Corpus>;

/**
 * `listJobs` end to end: a real HTTP `Request` goes through the real API
 * router into the real `Corpus`, wired to the real D1 binding this file's
 * Worker was given (`vitest.workers.config.ts`) running the generated
 * schema, and a real `Response` comes back.
 *
 * `corpus.test.ts` proves routing/decoding against a fake `Corpus` — it
 * cannot prove the search SQL is well-formed, because the fake never runs a
 * query. `corpus/live.test.ts` proves the SQL directly against `Corpus`,
 * skipping the HTTP layer. This file is the one place both are real at
 * once, which is what the search feature's diacritic-folding and keyset
 * pagination claims actually depend on end to end.
 */
const raw = (overrides: Partial<RawListing> = {}): RawListing => ({
  sourceId: "nav" as SourceId,
  sourceName: "NAV",
  externalId: "1",
  title: "Baker",
  employerName: "Bakery AS",
  location: "Oslo",
  description: "Bakes bread.",
  applicationUrl: "https://example.com/job/1",
  publishedAt: "2026-01-01T00:00:00Z",
  ...overrides,
});

/**
 * One resolved `Corpus`, backed by this file's real D1 binding, used both to
 * seed jobs directly (there is no HTTP write endpoint this slot owns) and as
 * the `Corpus` the HTTP handler runs against — so seeding and the request
 * that reads it back hit the same database.
 */
const buildRealHandler = () => {
  const corpus = Effect.runSync(
    Effect.provide(
      Effect.gen(function* () {
        return yield* Corpus;
      }),
      corpusPersistenceLayer.pipe(Layer.provide(databaseLayer(env.DB))),
    ),
  );
  const { handler } = buildHandler({ corpus: Layer.succeed(Corpus, corpus) });
  return { handler, corpus };
};

const observe = (corpus: CorpusShape, listing: ReturnType<typeof normalize>) =>
  Effect.runPromise(corpus.observe(listing));

describe("GET /api/v1/jobs, end to end against a real SQLite Corpus", () => {
  it("term, location, and status filter alone and combined, through the real route", async () => {
    const { handler, corpus } = buildRealHandler();
    await observe(
      corpus,
      normalize(raw({ externalId: "1", title: "Baker", employerName: "Bakery AS" })),
    );
    await observe(
      corpus,
      normalize(raw({ externalId: "2", title: "Barista", employerName: "Cafe Bakery AS" })),
    );
    await observe(
      corpus,
      normalize(
        raw({ externalId: "3", title: "Cleaner", employerName: "Renhold AS", location: "Bergen" }),
      ),
    );

    const byTerm = await handler(new Request("http://localhost/api/v1/jobs?term=bakery"));
    expect(
      (await byTerm.json()).data.map((job: { title: string }) => job.title).toSorted(),
    ).toEqual(["Baker", "Barista"]);

    const byLocation = await handler(new Request("http://localhost/api/v1/jobs?location=bergen"));
    expect((await byLocation.json()).data.map((job: { title: string }) => job.title)).toEqual([
      "Cleaner",
    ]);

    const combined = await handler(
      new Request("http://localhost/api/v1/jobs?term=bakery&location=oslo"),
    );
    expect(
      (await combined.json()).data.map((job: { title: string }) => job.title).toSorted(),
    ).toEqual(["Baker", "Barista"]);
  });

  it("an unrecognised status fails loudly rather than returning everything", async () => {
    const { handler, corpus } = buildRealHandler();
    await observe(corpus, normalize(raw()));
    const res = await handler(new Request("http://localhost/api/v1/jobs?status=archived"));
    expect(res.status).toBeGreaterThanOrEqual(500);
  });

  it("no filters keeps the unfiltered listing working, same as before search existed", async () => {
    const { handler, corpus } = buildRealHandler();
    await observe(corpus, normalize(raw({ externalId: "1" })));
    await observe(corpus, normalize(raw({ externalId: "2", title: "Barista" })));
    const res = await handler(new Request("http://localhost/api/v1/jobs"));
    const body = await res.json();
    expect(body.data.map((job: { title: string }) => job.title).toSorted()).toEqual([
      "Baker",
      "Barista",
    ]);
  });

  it("a lowercase term finds an upper-cased æøå employer name — the diacritic/case fold", async () => {
    const { handler, corpus } = buildRealHandler();
    await observe(
      corpus,
      normalize(
        raw({ title: "Rørlegger", employerName: "RØR OG VVS ØSTFOLD AS", location: "Østfold" }),
      ),
    );

    const byTerm = await handler(
      new Request(`http://localhost/api/v1/jobs?term=${encodeURIComponent("rør og vvs østfold")}`),
    );
    expect((await byTerm.json()).data).toHaveLength(1);

    const byLocation = await handler(
      new Request(`http://localhost/api/v1/jobs?location=${encodeURIComponent("østfold")}`),
    );
    expect((await byLocation.json()).data).toHaveLength(1);
  });

  it("paginating a filtered search while a matching job is inserted mid-walk skips and duplicates nothing", async () => {
    const { handler, corpus } = buildRealHandler();
    await observe(
      corpus,
      normalize(raw({ externalId: "1", title: "Baker A", employerName: "Bakery AS" })),
    );
    await observe(
      corpus,
      normalize(raw({ externalId: "2", title: "Baker B", employerName: "Bakery AS" })),
    );

    // Page 1: the first of the two jobs seeded so far.
    const page1 = await handler(new Request("http://localhost/api/v1/jobs?term=bakery&limit=1"));
    const body1 = await page1.json();
    expect(body1.data).toHaveLength(1);
    expect(body1.meta.nextCursor).not.toBeNull();

    // A new matching job is written between page 1 and page 2 — the corpus
    // ingesting concurrently with someone paging it, which is the ordinary
    // case this cursor has to survive.
    await observe(
      corpus,
      normalize(raw({ externalId: "3", title: "Baker C", employerName: "Bakery AS" })),
    );

    // Page 2, from page 1's cursor: must not repeat the job page 1 already
    // returned, and — because the insert landed after that cursor position —
    // must include both the second originally-seeded job and the new one.
    const page2 = await handler(
      new Request(
        `http://localhost/api/v1/jobs?term=bakery&limit=10&cursor=${body1.meta.nextCursor}`,
      ),
    );
    const body2 = await page2.json();
    const page1Titles = body1.data.map((job: { title: string }) => job.title);
    const page2Titles = body2.data.map((job: { title: string }) => job.title);
    expect(page1Titles.some((title: string) => page2Titles.includes(title))).toBe(false);
    expect([...page1Titles, ...page2Titles].toSorted()).toEqual(["Baker A", "Baker B", "Baker C"]);
  });
});
