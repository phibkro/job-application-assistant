import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type { CanonicalJob } from "@job-index/domain/Job";
import type { CanonicalJobId, PlatformId, Sequence } from "@job-index/domain/Ids";
import type { CatalogEntry } from "@job-index/domain/Source";
import { Corpus } from "../services/Corpus.ts";
import { SourceCatalog } from "../services/SourceCatalog.ts";
import { buildHandler } from "./testSupport.ts";

const job = (overrides: Partial<CanonicalJob> = {}): CanonicalJob => ({
  id: "cj_1" as CanonicalJobId,
  title: "Baker",
  employerName: "Bakery AS",
  location: "Oslo",
  description: "Bakes bread.",
  applicationUrl: "https://example.com/job/1",
  publishedAt: "2026-01-01T00:00:00Z",
  status: { _tag: "Active" },
  sequence: 1 as Sequence,
  changedAt: "2026-01-01T00:00:00Z",
  sources: [],
  ...overrides,
});

describe("corpus (public, no auth required)", () => {
  it("listJobs pages through Corpus.changedSince, cursor as the last item's sequence", async () => {
    const { handler } = buildHandler({
      corpus: Layer.succeed(Corpus, {
        observe: () => Effect.die("unused"),
        get: () => Effect.die("unused"),
        changedSince: (cursor, limit) =>
          Effect.succeed(
            [
              job({ id: "cj_1" as CanonicalJobId, sequence: ((cursor as number) + 1) as Sequence }),
            ].slice(0, limit),
          ),
        fresh: () => Effect.die("unused"),
        markOffered: () => Effect.die("unused"),
        closeAbsent: () => Effect.die("unused"),
      }),
    });
    const res = await handler(new Request("http://localhost/api/v1/jobs?limit=1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    // a full page (length === limit) leaves a cursor to keep walking
    expect(body.meta).toEqual({ limit: 1, nextCursor: "1" });
  });

  it("getJob 404s (as NotFound) when Corpus.get finds nothing", async () => {
    const { handler } = buildHandler({
      corpus: Layer.succeed(Corpus, {
        observe: () => Effect.die("unused"),
        get: () => Effect.succeed(undefined),
        changedSince: () => Effect.die("unused"),
        fresh: () => Effect.die("unused"),
        markOffered: () => Effect.die("unused"),
        closeAbsent: () => Effect.die("unused"),
      }),
    });
    const res = await handler(new Request("http://localhost/api/v1/jobs/missing"));
    expect(await res.json()).toMatchObject({ _tag: "NotFound" });
  });

  it("getJob returns the job Corpus.get finds", async () => {
    const found = job();
    const { handler } = buildHandler({
      corpus: Layer.succeed(Corpus, {
        observe: () => Effect.die("unused"),
        get: () => Effect.succeed(found),
        changedSince: () => Effect.die("unused"),
        fresh: () => Effect.die("unused"),
        markOffered: () => Effect.die("unused"),
        closeAbsent: () => Effect.die("unused"),
      }),
    });
    const res = await handler(new Request("http://localhost/api/v1/jobs/cj_1"));
    expect(res.status).toBe(200);
    expect((await res.json()).id).toBe("cj_1");
  });

  it("listSources decodes the wire tier into the domain's tagged union and passes it through", async () => {
    const entry: CatalogEntry = {
      id: "nav" as PlatformId,
      platform: "arbeidsplassen-nav",
      category: "public",
      listingsUrl: "https://example.com",
      tier: { _tag: "Feed" },
      policy: { _tag: "Allowed" },
      requiresPremium: false,
      priority: "high",
      confidence: "high",
      notes: "",
      verifiedAt: "2026-01-01T00:00:00Z",
    };
    let seenTier: unknown;
    const { handler } = buildHandler({
      sourceCatalog: Layer.succeed(SourceCatalog, {
        list: (tier) => {
          seenTier = tier;
          return Effect.succeed([entry]);
        },
      }),
    });
    const res = await handler(new Request("http://localhost/api/v1/sources/catalog?tier=feed"));
    expect(res.status).toBe(200);
    expect(seenTier).toEqual({ _tag: "Feed" });
    expect((await res.json()).data).toHaveLength(1);
  });
});
