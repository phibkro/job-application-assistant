import { describe, expect, it } from "vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
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
import { SourceLease } from "../services/SourceLease.ts";
import { layer as corpusLayer, normalize } from "../corpus/index.ts";
import * as SourceStateRepo from "../db/repositories/SourceState.ts";
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

/**
 * An in-memory `SourceLease`: check-and-set inside one `Effect.sync` — a
 * single, `yield`-free step no concurrent fiber can land inside of — which
 * is what actually models the Durable Object's single-threadedness rather
 * than merely asserting it. What it cannot model is the platform guarantee
 * *behind* that atomicity — that no two isolates can ever reach the same
 * object at once — only a real Durable Object under workerd proves that;
 * see the operator report for this slot's `just preview` run.
 */
const fakeSourceLease = (
  held: ReadonlyMap<PlatformId, string> = new Map(),
): SourceLease["Service"] => {
  const active = new Map(held);
  return {
    acquire: (platform, owner) =>
      Effect.sync(() => {
        const current = active.get(platform);
        if (current !== undefined) {
          return { _tag: "Held", owner: current } as const;
        }
        active.set(platform, owner);
        return { _tag: "Granted" } as const;
      }),
    release: (platform, owner) =>
      Effect.sync(() => {
        if (active.get(platform) === owner) {
          active.delete(platform);
        }
      }),
  };
};

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
  leaseRecoveryMs: 60_000,
};

/**
 * `ingestionLayer` needs `Corpus`, and `corpusLayer` needs `Database` —
 * `Layer.provideMerge` twice, not `Layer.mergeAll`, because `mergeAll` only
 * unions sibling layers' requirements without wiring one's output into
 * another's input; `provideMerge` is what actually threads `corpusLayer`'s
 * `Corpus` into `ingestionLayer`. `sourceLease` defaults to a fresh, empty
 * store — most tests never contend for it — and is a parameter for the ones
 * that do (pre-held, or shared across two overlapping `collect` calls).
 */
const testLayer = (
  script: PageScript,
  startCursor: string,
  sourceLease: SourceLease["Service"] = fakeSourceLease(),
) => {
  const deps = Layer.mergeAll(
    layerSqlite(),
    Layer.succeed(Acquisition, fakeAcquisition(script)),
    Layer.succeed(SourceCatalog, fakeCatalog(startCursor)),
    Layer.succeed(SourceLease, sourceLease),
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
        // What `source_state` itself holds after the reset — not just what
        // `second`'s report claims — because a run's own `RunReport` and
        // `ingestion_runs` log are built *after* the in-memory reset either
        // way; only reading the row back proves the reset actually reached
        // the table `checkpoint`/`release` write to.
        const persisted = yield* SourceStateRepo.find(PLATFORM);
        return { first, second, staleJob, aJob, persisted };
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
    // The reset is not merely a report-level courtesy: a third sweep must
    // actually resume from `startCursor` with an empty seen-id set, which is
    // only true if this is what `source_state` itself says.
    expect(result.persisted?.cursor).toBe("start");
    expect(result.persisted?.seenExternalIds).toEqual([]);
  });

  it("fails LeaseHeld when the platform's SourceLease is already held, naming its owner, and never writes to source_state", async () => {
    const script: PageScript = {
      start: { listings: [listing("1")], cursor: "start", more: false },
    };
    const held = fakeSourceLease(new Map([[PLATFORM, "someone-else"]]));

    const result = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const ingestion = yield* Ingestion;
          const failure = yield* ingestion.collect(PLATFORM, BUDGET).pipe(Effect.flip);
          const persisted = yield* SourceStateRepo.find(PLATFORM);
          return { failure, persisted };
        }),
        testLayer(script, "start", held),
      ),
    );

    expect(result.failure._tag).toBe("LeaseHeld");
    expect(result.failure.owner).toBe("someone-else");
    // A denied caller leaves no trace: it never reached `SourceStateRepo`.
    expect(result.persisted).toBeUndefined();
  });

  it(
    "two collect() calls for the same platform, genuinely overlapping — the second is denied " +
      "while the first is still mid-fetch, not called after it already finished",
    async () => {
      const sourceLease = fakeSourceLease();
      const startedFirstFetch = Deferred.makeUnsafe<void>();
      const releaseFirstFetch = Deferred.makeUnsafe<void>();

      // Blocks the first page fetch until the test explicitly lets it go, so
      // the second `collect` call is issued while the first is provably still
      // inside its walk — not merely scheduled one after the other, which
      // would prove nothing about the lease actually serializing anything.
      const blockingAcquisition: Acquisition["Service"] = {
        page: (_platform, cursor) =>
          Effect.gen(function* () {
            yield* Deferred.succeed(startedFirstFetch, undefined);
            yield* Deferred.await(releaseFirstFetch);
            return {
              listings: [listing("1")],
              cursor,
              more: false,
              via: "feed",
            } satisfies AcquiredPage;
          }),
      };

      const deps = Layer.mergeAll(
        layerSqlite(),
        Layer.succeed(Acquisition, blockingAcquisition),
        Layer.succeed(SourceCatalog, fakeCatalog("start")),
        Layer.succeed(SourceLease, sourceLease),
      );
      const layer = Layer.provideMerge(ingestionLayer, Layer.provideMerge(corpusLayer, deps));

      const outcome = await Effect.runPromise(
        Effect.provide(
          Effect.gen(function* () {
            const ingestion = yield* Ingestion;

            const firstFiber = yield* Effect.forkChild(ingestion.collect(PLATFORM, BUDGET));
            // Not a timing guess: this blocks until `collect` has acquired
            // the lease *and* entered its first page fetch — the earliest
            // point at which the two calls genuinely overlap.
            yield* Deferred.await(startedFirstFetch);

            const secondResult = yield* Effect.result(ingestion.collect(PLATFORM, BUDGET));

            yield* Deferred.succeed(releaseFirstFetch, undefined);
            const firstReport = yield* Fiber.join(firstFiber);

            return { firstReport, secondResult };
          }),
          layer,
        ),
      );

      expect(outcome.firstReport.stoppedReason).toBe("reached tail");
      if (outcome.secondResult._tag !== "Failure") {
        throw new Error("expected the overlapping call to be denied");
      }
      expect(outcome.secondResult.failure._tag).toBe("LeaseHeld");
      expect(outcome.secondResult.failure.owner).not.toBe("");
    },
  );

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
