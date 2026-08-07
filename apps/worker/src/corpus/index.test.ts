import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type { RawListing } from "@job-index/domain/Job";
import type { ProfileId, Sequence, SourceId } from "@job-index/domain/Ids";
import { Corpus } from "../services/Corpus.ts";
import { Database } from "../services/Database.ts";
import { layer, normalize } from "./index.ts";
import { makeTestDatabase } from "./testSupport.ts";

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
 * Exercises the exported `layer` exactly as the composition root will: a
 * `Database` layer is provided, `Corpus` is resolved from it, and every
 * method is reached only through the frozen tag — never by importing
 * `observe.ts`/`freshness.ts` directly. This is the test that would catch a
 * wiring mistake (a method left off `Corpus.of`, a typo in `layer`'s
 * dependency) that the per-module tests, correct as they are about their own
 * function, cannot see.
 */
const runWithLayer = <A, E>(effect: Effect.Effect<A, E, Corpus>): Promise<A> =>
  Effect.runPromise(
    Effect.provide(effect, layer.pipe(Layer.provide(Layer.succeed(Database, makeTestDatabase())))),
  );

describe("the corpus layer, end to end", () => {
  it("observe -> get -> changedSince -> fresh -> markOffered round-trips through the real tag", async () => {
    const listingA = normalize(raw({ externalId: "1", title: "Baker" }));
    const listingB = normalize(raw({ externalId: "2", title: "Barista" }));
    const profile = "alice" as ProfileId;

    const result = await runWithLayer(
      Effect.gen(function* () {
        const corpus = yield* Corpus;
        const outcomeA = yield* corpus.observe(listingA);
        const outcomeB = yield* corpus.observe(listingB);
        const fetched = yield* corpus.get(listingA.canonicalJobId);
        const changed = yield* corpus.changedSince(0 as unknown as Sequence, 10);
        const freshBefore = yield* corpus.fresh(profile, 10);
        // freshBefore is newest-first; marking offered through the OLDEST of
        // the two leaves the newer one still fresh, proving markOffered is a
        // high-water mark rather than "mark everything seen so far offered".
        const oldest = freshBefore.at(-1)!;
        yield* corpus.markOffered(profile, oldest.sequence);
        const freshAfter = yield* corpus.fresh(profile, 10);
        return { outcomeA, outcomeB, fetched, changed, freshBefore, freshAfter };
      }),
    );

    expect(result.outcomeA).toEqual({ _tag: "CreatedCanonical", id: listingA.canonicalJobId });
    expect(result.outcomeB).toEqual({ _tag: "CreatedCanonical", id: listingB.canonicalJobId });
    expect(result.fetched?.title).toBe("Baker");
    expect(result.changed.map((job) => job.title).toSorted()).toEqual(["Baker", "Barista"]);
    expect(result.freshBefore.length).toBe(2);
    expect(result.freshAfter.length).toBe(1); // the highest-sequence job was marked offered
  });

  it("3 source ads become 2 canonical jobs, 1 duplicate merged — through the layer", async () => {
    const adA = normalize(raw({ sourceId: "nav" as SourceId, externalId: "1" }));
    const adB = normalize(
      raw({
        sourceId: "nav" as SourceId,
        externalId: "2",
        title: "Warehouse Operative",
        employerName: "Nordic Logistics AS",
        location: "Bergen",
      }),
    );
    const adC = normalize(
      raw({
        sourceId: "webcruiter" as SourceId,
        externalId: "wc-77",
        applicationUrl: "https://webcruiter.example/ads/77",
      }),
    );

    const outcomes = await runWithLayer(
      Effect.gen(function* () {
        const corpus = yield* Corpus;
        const a = yield* corpus.observe(adA);
        const b = yield* corpus.observe(adB);
        const c = yield* corpus.observe(adC);
        const job = yield* corpus.get(adA.canonicalJobId);
        return { a, b, c, sources: job?.sources };
      }),
    );

    expect(outcomes.a._tag).toBe("CreatedCanonical");
    expect(outcomes.b._tag).toBe("CreatedCanonical");
    expect(outcomes.c).toEqual({ _tag: "AddedDuplicateOccurrence", id: adA.canonicalJobId });
    expect(outcomes.sources).toEqual(["nav", "webcruiter"]);
  });
});
