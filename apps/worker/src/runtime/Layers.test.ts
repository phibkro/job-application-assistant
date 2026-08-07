import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import * as HttpRouter from "effect/unstable/http/HttpRouter";
import type { SourceId } from "@job-index/domain/Ids";
import type { RawListing } from "@job-index/domain/Job";
import { makeFakeD1 } from "../db/FakeD1.ts";
import { normalize } from "../corpus/index.ts";
import { Corpus } from "../services/Corpus.ts";
import { Profiles } from "../services/Accounts.ts";
import { appLayer } from "../index.ts";
import { services } from "./Layers.ts";

/**
 * The wiring, exercised rather than inspected.
 *
 * Each slot proves itself against its own fakes; nothing before this proved
 * that the graph they compose into actually constructs, or that the D1-backed
 * `Database` — as opposed to the SQLite test layer every slot test uses — can
 * carry their queries. `makeFakeD1` is the real binding shape over the real
 * generated schema, so both questions get a live answer here.
 *
 * The Worker's own boot is a separate claim, and types cannot make it: the
 * bundle must also build for workerd, which `bun run bundle:check` gates after
 * the production entry was caught importing a Bun-only test layer.
 */
const withEnv = <A>(effect: Effect.Effect<A, never, Corpus | Profiles>): Promise<A> => {
  const env = { DB: makeFakeD1(), ENVIRONMENT: "test" };
  return Effect.runPromise(Effect.provide(effect, services(env)));
};

const raw: RawListing = {
  sourceId: "nav" as SourceId,
  sourceName: "NAV",
  externalId: "1",
  title: "Baker",
  employerName: "Bakery AS",
  location: "Oslo",
  description: "Bakes bread.",
  applicationUrl: "https://example.com/job/1",
  publishedAt: "2026-01-01T00:00:00Z",
};

describe("the service graph, over a D1 binding", () => {
  it("carries a corpus write and read back through the D1 layer", async () => {
    const listing = normalize(raw);
    const job = await withEnv(
      Effect.gen(function* () {
        const corpus = yield* Corpus;
        yield* corpus.observe(listing);
        return yield* corpus.get(listing.canonicalJobId);
      }),
    );
    expect(job?.title).toBe("Baker");
  });

  it("resolves the profile service from the same binding", async () => {
    const profile = await withEnv(
      Effect.gen(function* () {
        const profiles = yield* Profiles;
        return yield* profiles.get("profile-1" as never);
      }),
    );
    expect(profile.headline).toBe("");
  });
});

/** A fresh worker per call: each gets its own binding, as an isolate would. */
const handlerFor = (environment: string) =>
  HttpRouter.toWebHandler(appLayer({ DB: makeFakeD1(), ENVIRONMENT: environment })).handler;

describe("the worker's operational routes", () => {
  it("reports health in the shape the smoke suites assert", async () => {
    const response = await handlerFor("staging")(new Request("https://example.com/api/health"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "ok",
      service: "job-index",
      environment: "staging",
    });
  });

  it("reports the licence, which is a legal claim and not decoration", async () => {
    const response = await handlerFor("production")(new Request("https://example.com/api/about"));
    expect(await response.json()).toEqual({
      service: "job-index",
      license: "proprietary",
      environment: "production",
    });
  });

  it("404s an unknown route rather than answering it", async () => {
    const response = await handlerFor("staging")(new Request("https://example.com/nope"));
    expect(response.status).toBe(404);
  });
});
