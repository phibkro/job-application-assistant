import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import type { RawListing } from "@job-index/domain/Job";
import type { SourceId } from "@job-index/domain/Ids";
import { normalize } from "./identity.ts";
import { makeObserve } from "./observe.ts";
import { makeGet } from "./queries.ts";
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

describe("observe (against a real, if fake, Database)", () => {
  it("creates a canonical job on first sighting, and get() finds it", async () => {
    const database = makeTestDatabase();
    const observe = makeObserve(database);
    const get = makeGet(database);
    const listing = normalize(raw());

    const outcome = await Effect.runPromise(observe(listing));
    expect(outcome).toEqual({ _tag: "CreatedCanonical", id: listing.canonicalJobId });

    const job = await Effect.runPromise(get(listing.canonicalJobId));
    expect(job?.title).toBe("Baker");
    expect(job?.sources).toEqual(["nav"]);
    expect(job?.status).toEqual({ _tag: "Active" });
  });

  it("re-observing the same listing is Unchanged", async () => {
    const database = makeTestDatabase();
    const observe = makeObserve(database);
    const listing = normalize(raw());

    await Effect.runPromise(observe(listing));
    const second = await Effect.runPromise(observe(listing));
    expect(second).toEqual({ _tag: "Unchanged" });
  });

  it("changed content on the same occurrence is UpdatedCanonical and persists the change", async () => {
    const database = makeTestDatabase();
    const observe = makeObserve(database);
    const get = makeGet(database);
    const listing = normalize(raw());
    await Effect.runPromise(observe(listing));

    const revised = normalize(raw({ description: "Bakes bread and croissants." }));
    const outcome = await Effect.runPromise(observe(revised));
    expect(outcome).toEqual({ _tag: "UpdatedCanonical", id: listing.canonicalJobId });

    const job = await Effect.runPromise(get(listing.canonicalJobId));
    expect(job?.description).toBe("Bakes bread and croissants.");
  });

  /**
   * The proof the task hands down, run end to end through the real `layer`
   * shape (`makeObserve` against a `Database`, not the pure `decide` core
   * directly): three source advertisements, two of which are the same real
   * vacancy from different platforms, fold to two canonical jobs with one
   * duplicate merged, and both source occurrences are retained with
   * provenance on the shared canonical job.
   */
  it("3 source ads become 2 canonical jobs, 1 duplicate merged", async () => {
    const database = makeTestDatabase();
    const observe = makeObserve(database);
    const get = makeGet(database);

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
    expect(adC.canonicalJobId).toBe(adA.canonicalJobId); // same vacancy, different source

    const outcomeA = await Effect.runPromise(observe(adA));
    const outcomeB = await Effect.runPromise(observe(adB));
    const outcomeC = await Effect.runPromise(observe(adC));

    expect(outcomeA._tag).toBe("CreatedCanonical");
    expect(outcomeB._tag).toBe("CreatedCanonical");
    expect(outcomeC).toEqual({ _tag: "AddedDuplicateOccurrence", id: adA.canonicalJobId });

    const bakery = await Effect.runPromise(get(adA.canonicalJobId));
    expect(bakery?.sources).toEqual(["nav", "webcruiter"]);

    const warehouse = await Effect.runPromise(get(adB.canonicalJobId));
    expect(warehouse?.sources).toEqual(["nav"]);
    expect(bakery?.id).not.toBe(warehouse?.id); // 2 distinct canonical jobs from 3 ads
  });
});
