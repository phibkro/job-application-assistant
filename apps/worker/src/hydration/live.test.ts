import { describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type { RawListing } from "@job-index/domain/Job";
import type { PlatformId, SourceId } from "@job-index/domain/Ids";
import { layer as databaseLayer } from "../db/Live.ts";
import { normalize } from "../corpus/identity.ts";
import { layer as corpusLayer } from "../corpus/index.ts";
import { Acquisition } from "../services/Acquisition.ts";
import { Corpus } from "../services/Corpus.ts";
import { Hydration } from "../services/Hydration.ts";
import { hydrationLeaseLayer } from "../ingestion/SourceLeaseObject.ts";
import { layer as idsLayer } from "../runtime/Ids.ts";
import { layer as hydrationLayer } from "./index.ts";

/**
 * `Hydration` end to end: real D1 (`Corpus`), a real Durable Object
 * namespace (`HydrationLease`, sharing `env.SOURCE_LEASE` with
 * `SourceLease` — see `HydrationLease`'s own doc comment), and a
 * *controllable* fake `Acquisition` — the one seam this file must fake,
 * because the falsifiers below are about how many times it gets called,
 * which no real network call could assert deterministically.
 *
 * Proves falsifiers 4, 5, and 7 of `design-specs/deferred-hydration.md`;
 * falsifier 1 (one HTTP request per feed page) is proven separately, against
 * a fake `HttpClient`, in `packages/adapters/nav/src/index.test.ts` — that
 * is a fact about the NAV adapter, not about this service.
 */
const raw = (overrides: Partial<RawListing> = {}): RawListing => ({
  sourceId: "nav" as SourceId,
  sourceName: "NAV",
  platformId: "arbeidsplassen-nav" as PlatformId,
  externalId: "1",
  title: "Baker",
  employerName: "Bakery AS",
  location: "Oslo",
  description: "See source listing for details.",
  applicationUrl: "https://arbeidsplassen.nav.no/stillinger/stilling/1",
  publishedAt: "2026-01-01T00:00:00Z",
  hydrated: false,
  ...overrides,
});

/** A fake `Acquisition.hydrate` that counts calls and can be told to delay,
 *  so a genuine race (falsifier 5) has something to race against. */
const fakeAcquisition = (opts: {
  readonly delayMs?: number;
  readonly outcome?: "Hydrated" | "ClosedSince";
}) => {
  let calls = 0;
  const layer = Layer.succeed(Acquisition, {
    page: () => Effect.die("unused: this file only exercises hydrate"),
    hydrate: () =>
      Effect.gen(function* () {
        calls += 1;
        if (opts.delayMs !== undefined) {
          yield* Effect.sleep(opts.delayMs);
        }
        return opts.outcome === "ClosedSince"
          ? ({ _tag: "ClosedSince" } as const)
          : ({
              _tag: "Hydrated" as const,
              detail: {
                description: "A full advert, fetched on demand.",
                applicationUrl: "https://careers.example/jobs/1",
                deadline: "2026-12-31",
              },
            } as const);
      }),
  });
  return { layer, callCount: () => calls };
};

const run = <A>(
  effect: Effect.Effect<A, never, Corpus | Hydration>,
  acquisition: Layer.Layer<Acquisition>,
): Promise<A> => {
  const corpus = corpusLayer.pipe(Layer.provideMerge(databaseLayer(env.DB)));
  const leaves = Layer.mergeAll(corpus, idsLayer);
  const hydration = hydrationLayer.pipe(
    Layer.provide(acquisition),
    Layer.provide(hydrationLeaseLayer(env.SOURCE_LEASE)),
  );
  const full = Layer.provideMerge(hydration, leaves);
  return Effect.runPromise(Effect.provide(effect, full));
};

// A fresh externalId per test: `HydrationLease` keys its Durable Object by
// canonical job id (`hydrate:<id>`), and `canonicalJobId` is derived from
// title/employer/location — sharing one across tests would make two tests'
// leases alias the same object.
let nextId = 0;
const freshListing = (overrides: Partial<RawListing> = {}) => {
  nextId += 1;
  return normalize(raw({ externalId: `ext-${nextId}`, title: `Job ${nextId}`, ...overrides }));
};

describe("Hydration, against real D1 and a real Durable Object lease", () => {
  it("falsifier 4: opening an unhydrated vacancy hydrates it, and a second open fetches nothing further", async () => {
    const listing = freshListing();
    const { layer, callCount } = fakeAcquisition({});

    const [first, second] = await run(
      Effect.gen(function* () {
        const corpus = yield* Corpus;
        const hydration = yield* Hydration;
        yield* corpus.observe(listing);
        const a = yield* hydration.hydrate(listing.canonicalJobId);
        const b = yield* hydration.hydrate(listing.canonicalJobId);
        return [a, b] as const;
      }),
      layer,
    );

    expect(first?.hydration).toEqual({
      _tag: "Hydrated",
      description: "A full advert, fetched on demand.",
      deadline: "2026-12-31",
    });
    expect(first?.applicationUrl).toBe("https://careers.example/jobs/1");
    expect(second?.hydration).toEqual(first?.hydration);
    expect(callCount()).toBe(1);
  });

  it("falsifier 5: two concurrent opens of the same unhydrated vacancy fetch its detail once", async () => {
    const listing = freshListing();
    // Long enough that both fibers reach `lease.acquire` before either
    // fetch resolves — proven interleaving, not a hopeful race.
    const { layer, callCount } = fakeAcquisition({ delayMs: 30 });

    const [a, b] = await run(
      Effect.gen(function* () {
        const corpus = yield* Corpus;
        const hydration = yield* Hydration;
        yield* corpus.observe(listing);
        return yield* Effect.all(
          [hydration.hydrate(listing.canonicalJobId), hydration.hydrate(listing.canonicalJobId)],
          { concurrency: 2 },
        );
      }),
      layer,
    );

    expect(a?.hydration._tag).toBe("Hydrated");
    expect(b?.hydration._tag).toBe("Hydrated");
    expect(callCount()).toBe(1);
  });

  it("falsifier 7: an advert that closed before hydration reports Closed, not an empty Hydrated job", async () => {
    const listing = freshListing();
    const { layer, callCount } = fakeAcquisition({ outcome: "ClosedSince" });

    const job = await run(
      Effect.gen(function* () {
        const corpus = yield* Corpus;
        const hydration = yield* Hydration;
        yield* corpus.observe(listing);
        return yield* hydration.hydrate(listing.canonicalJobId);
      }),
      layer,
    );

    expect(job?.status._tag).toBe("Closed");
    // Not "Hydrated" with a blank description — there was never any
    // content to hydrate with, and the type this returns cannot lie about
    // that (see `CanonicalJobHydration`).
    expect(job?.hydration).toEqual({ _tag: "Unhydrated" });
    expect(callCount()).toBe(1);
  });

  it("a closed vacancy is never re-fetched — hydrate is idempotent past the closure, not just past success", async () => {
    const listing = freshListing();
    const { layer, callCount } = fakeAcquisition({ outcome: "ClosedSince" });

    await run(
      Effect.gen(function* () {
        const corpus = yield* Corpus;
        const hydration = yield* Hydration;
        yield* corpus.observe(listing);
        yield* hydration.hydrate(listing.canonicalJobId);
        yield* hydration.hydrate(listing.canonicalJobId);
      }),
      layer,
    );

    expect(callCount()).toBe(1);
  });
});
