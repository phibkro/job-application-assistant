import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type { RawListing } from "@job-index/domain/Job";
import type { CatalogEntry } from "@job-index/domain/Source";
import type { PlatformId, SourceId } from "@job-index/domain/Ids";
import type { AcquiredPage } from "@job-index/adapters/SourceAdapter";
import { Unauthorized } from "@job-index/domain/Failure";
import { layerSqlite } from "../db/Sqlite.ts";
import { Acquisition } from "../services/Acquisition.ts";
import { Corpus } from "../services/Corpus.ts";
import { Database } from "../services/Database.ts";
import { Ingestion } from "../services/Ingestion.ts";
import type { RunBudget } from "../services/Ingestion.ts";
import { SourceCatalog } from "../services/SourceCatalog.ts";
import { layer as corpusLayer, normalize } from "../corpus/index.ts";
import { layer as ingestionLayer } from "./index.ts";
import type { PageFailure } from "./failureDetail.ts";

/**
 * `Ingestion.collect` against a real SQL engine running the generated
 * schema — `source_state`, `ingestion_runs`, `ingestion_failures`, and
 * `Corpus`'s own tables, all through `bun:sqlite`, the way
 * `corpus/live.test.ts` closed the same gap for the corpus slot: a fake
 * `Database` recognises a statement by object identity and can prove
 * nothing about the SQL. What this file cannot exercise is `Acquisition`
 * itself — a real NAV connection is `packages/adapters/nav`'s own concern —
 * so `Acquisition` and `SourceCatalog` are scripted fakes, and only
 * `Database`/`Corpus`/`Ingestion` are real.
 */

const PLATFORM = "test-platform" as PlatformId;
const SOURCE = "test-source" as SourceId;

type PageScript = Record<
  string,
  | {
      readonly listings: ReadonlyArray<RawListing>;
      readonly cursor: string;
      readonly more: boolean;
    }
  | { readonly fail: PageFailure }
>;

const fakeAcquisition = (script: PageScript): Acquisition["Service"] => ({
  page: (_platform, cursor) => {
    const step = script[cursor];
    if (step === undefined) {
      return Effect.die(`ingestion live test: unscripted cursor "${cursor}"`);
    }
    if ("fail" in step) {
      return Effect.fail(step.fail);
    }
    return Effect.succeed({
      listings: step.listings,
      cursor: step.cursor,
      more: step.more,
      via: "feed",
    } satisfies AcquiredPage);
  },
});

const fakeCatalog = (startCursor: string): SourceCatalog["Service"] => ({
  list: () =>
    Effect.succeed([
      {
        id: PLATFORM,
        platform: "Test Platform",
        category: "test",
        listingsUrl: startCursor,
        tier: { _tag: "Feed" },
        policy: { _tag: "Unreviewed" },
        requiresPremium: false,
        priority: "P1",
        confidence: "high",
        notes: "",
        verifiedAt: "2026-01-01",
      } satisfies CatalogEntry,
    ]),
});

const listing = (externalId: string, overrides: Partial<RawListing> = {}): RawListing => ({
  sourceId: SOURCE,
  sourceName: "Test Source",
  externalId,
  title: `Job ${externalId}`,
  employerName: "Employer AS",
  location: "Oslo",
  description: "A job.",
  applicationUrl: `https://example.com/job/${externalId}`,
  publishedAt: "2026-01-01T00:00:00Z",
  ...overrides,
});

const BUDGET: RunBudget = {
  maxPages: 10,
  maxObservations: 100,
  maxDurationMs: 10_000,
  leaseTtlMs: 60_000,
};

/**
 * `ingestionLayer` needs `Corpus`, and `corpusLayer` needs `Database` —
 * `Layer.provideMerge` twice, not `Layer.mergeAll`, because `mergeAll` only
 * unions sibling layers' requirements without wiring one's output into
 * another's input; `provideMerge` is what actually threads `corpusLayer`'s
 * `Corpus` into `ingestionLayer`.
 */
const testLayer = (script: PageScript, startCursor: string) => {
  const deps = Layer.mergeAll(
    layerSqlite(),
    Layer.succeed(Acquisition, fakeAcquisition(script)),
    Layer.succeed(SourceCatalog, fakeCatalog(startCursor)),
  );
  const withCorpus = Layer.provideMerge(corpusLayer, deps);
  return Layer.provideMerge(ingestionLayer, withCorpus);
};

const run = <A, E>(
  script: PageScript,
  startCursor: string,
  effect: Effect.Effect<A, E, Ingestion | Corpus | Database>,
): Promise<A> => Effect.runPromise(Effect.provide(effect, testLayer(script, startCursor)));

describe("Ingestion.collect on a real SQLite engine", () => {
  it("reaches the tail in one run, folds every listing, and closes nothing the first time (nothing was ever active before)", async () => {
    const script: PageScript = {
      start: { listings: [listing("1"), listing("2")], cursor: "page-2", more: true },
      "page-2": { listings: [listing("3")], cursor: "page-2", more: false },
    };
    const report = await run(
      script,
      "start",
      Effect.gen(function* () {
        const ingestion = yield* Ingestion;
        return yield* ingestion.collect(PLATFORM, BUDGET);
      }),
    );

    expect(report.pages).toBe(2);
    expect(report.observations).toBe(3);
    expect(report.canonicalChanges).toBe(3); // three CreatedCanonical, nothing closed
    expect(report.cursorBefore).toBe("start");
    // A completed sweep resets to the beginning, ready for the next one.
    expect(report.cursorAfter).toBe("start");
    expect(report.stoppedReason).toBe("reached tail");
  });

  it("a run that exhausts its page budget checkpoints where it stopped and does not close anything", async () => {
    const script: PageScript = {
      start: { listings: [listing("1")], cursor: "page-2", more: true },
      "page-2": { listings: [listing("2")], cursor: "page-3", more: true },
    };
    const smallBudget: RunBudget = { ...BUDGET, maxPages: 1 };

    const result = await run(
      script,
      "start",
      Effect.gen(function* () {
        const ingestion = yield* Ingestion;
        const corpus = yield* Corpus;
        // A vacancy this source used to advertise, before this run ever starts.
        const priorListing = normalize(listing("was-here-before"));
        yield* corpus.observe(priorListing);

        const report = yield* ingestion.collect(PLATFORM, smallBudget);
        const priorJob = yield* corpus.get(priorListing.canonicalJobId);
        return { report, priorJob };
      }),
    );

    expect(result.report.pages).toBe(1);
    expect(result.report.stoppedReason).toBe("budget exhausted: pages");
    // Checkpointed mid-sweep, not reset — the next run must resume, not restart.
    expect(result.report.cursorAfter).toBe("page-2");
    // The core invariant: a partial run saw nothing of "was-here-before" and
    // must not have closed it.
    expect(result.priorJob?.status._tag).toBe("Active");
  });

  it("a resumed sweep accumulates seen ids across runs, and only the run that finally reaches the tail closes what neither run saw", async () => {
    const script: PageScript = {
      start: { listings: [listing("a"), listing("b")], cursor: "mid", more: true },
      mid: { listings: [], cursor: "mid", more: false },
    };
    const onePageBudget: RunBudget = { ...BUDGET, maxPages: 1 };

    const result = await run(
      script,
      "start",
      Effect.gen(function* () {
        const ingestion = yield* Ingestion;
        const corpus = yield* Corpus;
        const stale = normalize(listing("stale"));
        yield* corpus.observe(stale);

        const first = yield* ingestion.collect(PLATFORM, onePageBudget);
        // Second invocation, same platform: must resume from "mid", not restart
        // from "start" (which this script no longer answers usefully — a
        // restart would refetch "a"/"b" as if freshly discovered, not fail,
        // so the real proof is in the assertions below, not in this call
        // succeeding).
        const second = yield* ingestion.collect(PLATFORM, BUDGET);

        const staleJob = yield* corpus.get(stale.canonicalJobId);
        const aJob = yield* corpus.get(normalize(listing("a")).canonicalJobId);
        return { first, second, staleJob, aJob };
      }),
    );

    expect(result.first.stoppedReason).toBe("budget exhausted: pages");
    expect(result.first.cursorAfter).toBe("mid");
    // The second run only fetched "mid" (empty, tail) — it did not need to
    // see "a"/"b" again to know they were part of this sweep, because the
    // first run's accumulated ids survived in `source_state`.
    expect(result.second.pages).toBe(1);
    expect(result.second.observations).toBe(0);
    expect(result.second.stoppedReason).toBe("reached tail");
    expect(result.second.cursorAfter).toBe("start"); // reset for the next sweep
    // The vacancy neither run ever saw again is now closed — closeAbsent ran
    // with the *whole* sweep's seen set ([a, b]), accumulated across both runs.
    expect(result.staleJob?.status._tag).toBe("Closed");
    // "a" itself is untouched by the close (it was seen, just not this run).
    expect(result.aJob?.status._tag).toBe("Active");
  });

  it("fails LeaseHeld against a live, unexpired lease, naming its owner, and never touches the corpus", async () => {
    const script: PageScript = {
      start: { listings: [listing("1")], cursor: "start", more: false },
    };

    const failure = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const db = yield* Database;
          const farFuture = Date.now() + 60_000;
          yield* db.run(
            `INSERT INTO source_state (platformId, cursor, seenExternalIds, resolvedSourceId, leaseOwner, leaseExpiresAt, updatedAt)
             VALUES (?, 'start', '[]', NULL, 'someone-else', ?, ?)`,
            [PLATFORM, farFuture, new Date().toISOString()],
          );
          const ingestion = yield* Ingestion;
          return yield* ingestion.collect(PLATFORM, BUDGET);
        }).pipe(Effect.flip),
        testLayer(script, "start"),
      ),
    );

    expect(failure._tag).toBe("LeaseHeld");
    expect(failure.owner).toBe("someone-else");
  });

  it("records a page failure in the ledger and stops the run without closing anything", async () => {
    const script: PageScript = { start: { fail: new Unauthorized({ source: "test-source" }) } };

    const result = await run(
      script,
      "start",
      Effect.gen(function* () {
        const ingestion = yield* Ingestion;
        const db = yield* Database;
        const report = yield* ingestion.collect(PLATFORM, BUDGET);
        const failures = yield* db.query<{ failureTag: string; detail: string }>(
          "SELECT failureTag, detail FROM ingestion_failures WHERE platformId = ?",
          [PLATFORM],
        );
        return { report, failures };
      }),
    );

    expect(result.report.stoppedReason).toBe("failed: Unauthorized (credentials rejected)");
    expect(result.report.pages).toBe(0);
    expect(result.failures).toEqual([
      { failureTag: "Unauthorized", detail: "credentials rejected" },
    ]);
  });
});
