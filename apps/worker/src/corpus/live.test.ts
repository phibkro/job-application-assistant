import { describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type { CanonicalJob, RawListing } from "@job-index/domain/Job";
import type { PlatformId, SourceId } from "@job-index/domain/Ids";
import { layer as databaseLayer } from "../db/Live.ts";
import { Corpus } from "../services/Corpus.ts";
import { layer as corpusLayer } from "./index.ts";
import { normalize } from "./identity.ts";

/** `CanonicalJob.hydration`'s `description`, or `undefined` if unhydrated — test-only convenience. */
const descriptionOf = (job: CanonicalJob | undefined): string | undefined =>
  job !== undefined && job.hydration._tag === "Hydrated" ? job.hydration.description : undefined;

/** Everything browse/search actually surface, so falsifier 3 compares the
 *  fields those endpoints render rather than the whole row (`applicationUrl`
 *  is deliberately excluded — see this file's falsifier-3 test). */
const displayFieldsOf = (job: CanonicalJob) => ({
  id: job.id,
  title: job.title,
  employerName: job.employerName,
  location: job.location,
  publishedAt: job.publishedAt,
  status: job.status,
  sequence: job.sequence,
  changedAt: job.changedAt,
  sources: job.sources,
});

/**
 * The corpus against a real D1 binding running the generated schema.
 *
 * Every other test in this slot runs on `testSupport.ts`'s fake `Database`,
 * which recognises a statement by object identity — so it proves the logic and
 * can prove nothing whatever about the SQL. A misspelt column, a placeholder
 * count that does not match its bindings, a table that `db/schema.sql` never
 * had: the fake passes all three. A real engine executing `db/schema.sql`
 * rejects them, which is why this file exists and why it imports the
 * persistence slot's layer instead of a second engine of its own.
 *
 * This closes the gap the corpus slot reported: it could not test against a
 * real engine because `canonical_jobs` and `occurrences` were absent from the
 * snapshot. They are generated from the domain models now. The engine itself
 * moved on from `bun:sqlite` to the real D1 binding this file's Worker was
 * given (`vitest.workers.config.ts`) — see that file for why.
 */
const run = <A>(effect: Effect.Effect<A, never, Corpus>): Promise<A> =>
  Effect.runPromise(Effect.provide(effect, Layer.provide(corpusLayer, databaseLayer(env.DB))));

const raw = (overrides: Partial<RawListing> = {}): RawListing => ({
  sourceId: "nav" as SourceId,
  sourceName: "NAV",
  platformId: "arbeidsplassen-nav" as PlatformId,
  externalId: "1",
  title: "Baker",
  employerName: "Bakery AS",
  location: "Oslo",
  description: "Bakes bread.",
  applicationUrl: "https://example.com/job/1",
  publishedAt: "2026-01-01T00:00:00Z",
  hydrated: true,
  ...overrides,
});

describe("corpus on a real SQLite engine", () => {
  it("observe writes SQL the generated schema accepts, and get reads it back", async () => {
    const listing = normalize(raw());
    const job = await run(
      Effect.gen(function* () {
        const corpus = yield* Corpus;
        yield* corpus.observe(listing);
        return yield* corpus.get(listing.canonicalJobId);
      }),
    );
    expect(job?.title).toBe("Baker");
    expect(job?.sources).toEqual(["nav"]);
  });

  it("re-observing updates in place rather than violating the canonical key", async () => {
    const listing = normalize(raw());
    const jobs = await run(
      Effect.gen(function* () {
        const corpus = yield* Corpus;
        yield* corpus.observe(listing);
        yield* corpus.observe(normalize(raw({ description: "Bakes bread and cake." })));
        return yield* corpus.changedSince(0 as never, 10);
      }),
    );
    expect(jobs).toHaveLength(1);
    expect(descriptionOf(jobs[0])).toBe("Bakes bread and cake.");
  });

  it("closeAbsent closes a vacancy the source stopped advertising", async () => {
    const listing = normalize(raw());
    const closed = await run(
      Effect.gen(function* () {
        const corpus = yield* Corpus;
        yield* corpus.observe(listing);
        const outcomes = yield* corpus.closeAbsent("nav" as SourceId, []);
        const job = yield* corpus.get(listing.canonicalJobId);
        return { outcomes, job };
      }),
    );
    expect(closed.outcomes).toEqual([{ _tag: "ClosedCanonical", id: listing.canonicalJobId }]);
    expect(closed.job?.status._tag).toBe("Closed");
  });

  it("a vacancy another source still advertises stays open", async () => {
    // Same vacancy, two platforms: one drops it, the other does not.
    const viaNav = normalize(raw());
    const viaFinn = normalize(
      raw({ sourceId: "finn" as SourceId, sourceName: "Finn", externalId: "f1" }),
    );
    const swept = await run(
      Effect.gen(function* () {
        const corpus = yield* Corpus;
        yield* corpus.observe(viaNav);
        yield* corpus.observe(viaFinn);
        const outcomes = yield* corpus.closeAbsent("nav" as SourceId, []);
        const job = yield* corpus.get(viaNav.canonicalJobId);
        return { outcomes, job };
      }),
    );
    expect(viaFinn.canonicalJobId).toBe(viaNav.canonicalJobId);
    expect(swept.outcomes).toEqual([]);
    expect(swept.job?.status._tag).toBe("Active");
  });

  it("a source that still advertises everything closes nothing", async () => {
    const listing = normalize(raw());
    const outcomes = await run(
      Effect.gen(function* () {
        const corpus = yield* Corpus;
        yield* corpus.observe(listing);
        return yield* corpus.closeAbsent("nav" as SourceId, ["1"]);
      }),
    );
    expect(outcomes).toEqual([]);
  });

  it("a closed vacancy reopens when the source advertises it again, and closure moves the sequence", async () => {
    const listing = normalize(raw());
    const after = await run(
      Effect.gen(function* () {
        const corpus = yield* Corpus;
        yield* corpus.observe(listing);
        yield* corpus.closeAbsent("nav" as SourceId, []);
        const reopened = yield* corpus.observe(listing);
        const changed = yield* corpus.changedSince(0 as never, 10);
        return { reopened, changed };
      }),
    );
    expect(after.reopened).toEqual({ _tag: "ReopenedCanonical", id: listing.canonicalJobId });
    expect(after.changed).toHaveLength(1);
    expect(after.changed[0]?.status._tag).toBe("Active");
  });

  describe("search", () => {
    it("term matches title or employer, location matches location, status matches statusTag — alone and combined", async () => {
      const baker = normalize(
        raw({ externalId: "1", title: "Baker", employerName: "Bakery AS", location: "Trondheim" }),
      );
      const barista = normalize(
        raw({
          externalId: "2",
          title: "Barista",
          employerName: "Cafe Bakery AS",
          location: "Bergen",
        }),
      );
      const cleaner = normalize(
        raw({ externalId: "3", title: "Cleaner", employerName: "Renhold AS", location: "Oslo" }),
      );
      const found = await run(
        Effect.gen(function* () {
          const corpus = yield* Corpus;
          yield* corpus.observe(baker);
          yield* corpus.observe(barista);
          yield* corpus.observe(cleaner);
          yield* corpus.closeAbsent("nav" as SourceId, ["2", "3"]); // closes `baker`
          return {
            byTerm: yield* corpus.search({ term: "bakery" }, 0 as never, 10),
            byLocation: yield* corpus.search({ location: "oslo" }, 0 as never, 10),
            byStatus: yield* corpus.search({ status: "Closed" }, 0 as never, 10),
            combined: yield* corpus.search({ term: "bakery", location: "bergen" }, 0 as never, 10),
          };
        }),
      );
      expect(found.byTerm.map((job) => job.title).toSorted()).toEqual(["Baker", "Barista"]);
      expect(found.byLocation.map((job) => job.title)).toEqual(["Cleaner"]);
      expect(found.byStatus.map((job) => job.title)).toEqual(["Baker"]);
      expect(found.combined.map((job) => job.title)).toEqual(["Barista"]);
    });

    it("term does not match description, so a description word finds nothing", async () => {
      const listing = normalize(raw({ description: "Requires a valid driving license." }));
      const found = await run(
        Effect.gen(function* () {
          const corpus = yield* Corpus;
          yield* corpus.observe(listing);
          return yield* corpus.search({ term: "license" }, 0 as never, 10);
        }),
      );
      expect(found).toEqual([]);
    });

    it("search is case- and diacritic-insensitive: a lowercase term finds an upper-cased æøå location", async () => {
      const listing = normalize(raw({ location: "ØSTFOLD" }));
      const found = await run(
        Effect.gen(function* () {
          const corpus = yield* Corpus;
          yield* corpus.observe(listing);
          return yield* corpus.search({ location: "østfold" }, 0 as never, 10);
        }),
      );
      expect(found).toHaveLength(1);
    });
  });

  /**
   * Falsifier 3: browse and search results must be identical, field for
   * field, whether or not the vacancy has been hydrated. `applicationUrl`
   * is deliberately excluded from the comparison (see `displayFieldsOf`):
   * unlike `description`/`deadline` it is not one of "the deferred fields"
   * the falsifier's own justification names — a summary already carries a
   * real, working one (NAV's public advert page; see the design spec's
   * "applicationUrl stays required" section), and hydration may upgrade it
   * to a better one (the employer's own application link). Everything
   * `changedSince`/`search` actually let a person act on — title, employer,
   * location, status, provenance — is untouched by hydration by
   * construction: `Corpus.hydrateDetail` never writes those columns.
   */
  it("falsifier 3: changedSince/search results are identical before and after hydration, field for field (excluding applicationUrl)", async () => {
    const listing = normalize(raw({ hydrated: false, description: "" }));
    const { before, after } = await run(
      Effect.gen(function* () {
        const corpus = yield* Corpus;
        yield* corpus.observe(listing);
        const beforeChanged = yield* corpus.changedSince(0 as never, 10);
        const beforeSearch = yield* corpus.search({ term: "baker" }, 0 as never, 10);

        yield* corpus.hydrateDetail(listing.canonicalJobId, {
          description: "A full advert, fetched on demand.",
          applicationUrl: "https://careers.example/jobs/1",
          deadline: "2026-12-31",
        });

        const afterChanged = yield* corpus.changedSince(0 as never, 10);
        const afterSearch = yield* corpus.search({ term: "baker" }, 0 as never, 10);
        return {
          before: { changed: beforeChanged, search: beforeSearch },
          after: { changed: afterChanged, search: afterSearch },
        };
      }),
    );

    expect(before.changed[0]?.hydration).toEqual({ _tag: "Unhydrated" });
    expect(after.changed[0]?.hydration._tag).toBe("Hydrated");
    expect(before.changed.map((job) => displayFieldsOf(job))).toEqual(
      after.changed.map((job) => displayFieldsOf(job)),
    );
    expect(before.search.map((job) => displayFieldsOf(job))).toEqual(
      after.search.map((job) => displayFieldsOf(job)),
    );
  });

  describe("hydration primitives (occurrenceFor / hydrateDetail / closeEarly)", () => {
    it("occurrenceFor returns the platform and external id of the active occurrence", async () => {
      const listing = normalize(raw({ hydrated: false }));
      const target = await run(
        Effect.gen(function* () {
          const corpus = yield* Corpus;
          yield* corpus.observe(listing);
          return yield* corpus.occurrenceFor(listing.canonicalJobId);
        }),
      );
      expect(target).toEqual({ platformId: "arbeidsplassen-nav", externalId: "1" });
    });

    it("occurrenceFor is undefined once every occurrence is inactive", async () => {
      const listing = normalize(raw({ hydrated: false }));
      const target = await run(
        Effect.gen(function* () {
          const corpus = yield* Corpus;
          yield* corpus.observe(listing);
          yield* corpus.closeAbsent("nav" as SourceId, []);
          return yield* corpus.occurrenceFor(listing.canonicalJobId);
        }),
      );
      expect(target).toBeUndefined();
    });

    it("hydrateDetail is idempotent: a second call on an already-hydrated job is a no-op", async () => {
      const listing = normalize(raw({ hydrated: false }));
      const detail = {
        description: "First fetch.",
        applicationUrl: "https://careers.example/jobs/1",
        deadline: undefined,
      };
      const jobs = await run(
        Effect.gen(function* () {
          const corpus = yield* Corpus;
          yield* corpus.observe(listing);
          const first = yield* corpus.hydrateDetail(listing.canonicalJobId, detail);
          const second = yield* corpus.hydrateDetail(listing.canonicalJobId, {
            ...detail,
            description: "A second fetch that must never land.",
          });
          return { first, second };
        }),
      );
      expect(descriptionOf(jobs.first)).toBe("First fetch.");
      expect(descriptionOf(jobs.second)).toBe("First fetch.");
    });

    it("closeEarly closes an Active job and leaves it Unhydrated, never an empty Hydrated one", async () => {
      const listing = normalize(raw({ hydrated: false }));
      const closed = await run(
        Effect.gen(function* () {
          const corpus = yield* Corpus;
          yield* corpus.observe(listing);
          return yield* corpus.closeEarly(listing.canonicalJobId);
        }),
      );
      expect(closed?.status._tag).toBe("Closed");
      expect(closed?.hydration).toEqual({ _tag: "Unhydrated" });
    });
  });
});
