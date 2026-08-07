import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import type { CanonicalJob, RawListing } from "@job-index/domain/Job";
import type { CanonicalJobId, ProfileId, Sequence, SourceId } from "@job-index/domain/Ids";
import { normalize } from "./identity.ts";
import { makeObserve } from "./observe.ts";
import { makeFresh, makeMarkOffered } from "./freshness.ts";
import { insertCanonicalJobBindings, rowFromCanonicalJob } from "./rows.ts";
import { INSERT_CANONICAL_JOB } from "./sql.ts";
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

const alice = "alice" as ProfileId;
const bob = "bob" as ProfileId;

describe("fresh / markOffered", () => {
  it("a profile who has never been offered anything sees everything, newest first", async () => {
    const database = makeTestDatabase();
    const observe = makeObserve(database);
    const fresh = makeFresh(database);

    await Effect.runPromise(observe(normalize(raw({ externalId: "1", title: "Baker" }))));
    await Effect.runPromise(observe(normalize(raw({ externalId: "2", title: "Barista" }))));

    const jobs = await Effect.runPromise(fresh(alice, 10));
    expect(jobs.map((job) => job.title)).toEqual(["Barista", "Baker"]); // newest first
  });

  it("markOffered advances the high-water mark, so an offered vacancy stops being fresh", async () => {
    const database = makeTestDatabase();
    const observe = makeObserve(database);
    const fresh = makeFresh(database);
    const markOffered = makeMarkOffered(database);

    await Effect.runPromise(observe(normalize(raw({ externalId: "1", title: "Baker" }))));
    const [firstBatch] = await Effect.runPromise(fresh(alice, 10));
    await Effect.runPromise(markOffered(alice, firstBatch!.sequence));

    await Effect.runPromise(observe(normalize(raw({ externalId: "2", title: "Barista" }))));
    const secondBatch = await Effect.runPromise(fresh(alice, 10));

    expect(secondBatch.map((job) => job.title)).toEqual(["Barista"]);
  });

  it("freshness is per profile: one profile's markOffered does not affect another's", async () => {
    const database = makeTestDatabase();
    const observe = makeObserve(database);
    const fresh = makeFresh(database);
    const markOffered = makeMarkOffered(database);

    await Effect.runPromise(observe(normalize(raw())));
    const [job] = await Effect.runPromise(fresh(alice, 10));
    await Effect.runPromise(markOffered(alice, job!.sequence));

    expect(await Effect.runPromise(fresh(alice, 10))).toEqual([]);
    expect((await Effect.runPromise(fresh(bob, 10))).length).toBe(1);
  });

  it("markOffered never rewinds the high-water mark", async () => {
    const database = makeTestDatabase();
    const observe = makeObserve(database);
    const fresh = makeFresh(database);
    const markOffered = makeMarkOffered(database);

    await Effect.runPromise(observe(normalize(raw({ externalId: "1" }))));
    await Effect.runPromise(observe(normalize(raw({ externalId: "2", title: "Barista" }))));
    const jobs = await Effect.runPromise(fresh(alice, 10));
    const highest = Math.max(...jobs.map((job) => job.sequence));

    await Effect.runPromise(markOffered(alice, highest as Sequence));
    await Effect.runPromise(markOffered(alice, 1 as Sequence)); // a stale/out-of-order call

    expect(await Effect.runPromise(fresh(alice, 10))).toEqual([]);
  });

  it("closed vacancies are never fresh", async () => {
    // observe() has no path that produces a Closed row (see this slot's
    // report on ClosedCanonical), so this seeds one directly through the
    // fake Database's own INSERT statement — exercising fresh()'s Active
    // filter for real rather than asserting a tautology.
    const database = makeTestDatabase();
    const fresh = makeFresh(database);
    const closedJob: CanonicalJob = {
      id: "cj_closed" as CanonicalJobId,
      title: "Seasonal Picker",
      employerName: "Orchard AS",
      location: "Hardanger",
      description: "Picks apples.",
      applicationUrl: "https://example.com/job/closed",
      publishedAt: "2026-01-01T00:00:00Z",
      status: { _tag: "Closed", closedAt: "2026-01-05T00:00:00Z" },
      sequence: 1 as Sequence,
      changedAt: "2026-01-05T00:00:00Z",
      sources: ["nav" as SourceId],
    };
    await Effect.runPromise(
      database.run(
        INSERT_CANONICAL_JOB,
        insertCanonicalJobBindings(
          rowFromCanonicalJob(closedJob, "seasonal picker orchard as hardanger"),
        ),
      ),
    );

    expect(await Effect.runPromise(fresh(alice, 10))).toEqual([]);
  });
});
