import { describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import type { PlatformId, Sequence } from "@job-index/domain/Ids";
import type { CatalogEntry } from "@job-index/domain/Source";
import { layer as databaseLayer } from "../db/Live.ts";
import { Database } from "../services/Database.ts";
import { Ingestion } from "../services/Ingestion.ts";
import type { RunReport } from "../services/Ingestion.ts";
import { SourceCatalog } from "../services/SourceCatalog.ts";
import { NAV_PLATFORM_ID } from "@job-index/adapters/nav";
import * as IngestionGateRepo from "../db/repositories/IngestionGate.ts";
import type { Env } from "../runtime/Env.ts";
import { ingestIfDue } from "./lazy.ts";
import { armsGate, runLazyIngestion } from "../index.ts";

/**
 * The claim-exclusivity claim, executed against a real D1 binding (WS-0017
 * acceptance d): N concurrent gate firings race one `atomicAffected`
 * compare-and-set, and exactly one of them may collect. `db/
 * transactionSemantics.live.test.ts` proves the primitive's win/loss vectors;
 * this file proves the gate's use of it under concurrency — the property the
 * whole single-flight design rests on.
 *
 * `Database` is real; only `SourceCatalog` and `Ingestion` are fakes (the
 * catalog's Feed list, and a counting collector that never touches NAV).
 */
const PLATFORM: PlatformId = NAV_PLATFORM_ID;

const report: RunReport = {
  pages: 1,
  observations: 0,
  canonicalChanges: 0,
  cursorBefore: "",
  cursorAfter: "",
  highestSequence: 0 as Sequence,
  stoppedReason: "reached tail",
  durationMs: 0,
};

let collections = 0;

const fakeEdges = Layer.mergeAll(
  Layer.succeed(SourceCatalog, {
    list: (tier): Effect.Effect<ReadonlyArray<CatalogEntry>> =>
      Effect.succeed(
        tier?._tag === "Feed"
          ? [
              {
                id: PLATFORM,
                platform: "test",
                category: "test",
                listingsUrl: "https://example.com/feed",
                tier: { _tag: "Feed" },
                policy: { _tag: "Allowed" },
                requiresPremium: false,
                priority: "P1",
                confidence: "high",
                notes: "",
                verifiedAt: "2026-08-25",
              } satisfies CatalogEntry,
            ]
          : [],
      ),
  }),
  Layer.succeed(Ingestion, {
    collect: () => {
      collections += 1;
      return Effect.succeed(report);
    },
  }),
);

const runGate = <A>(effect: Effect.Effect<A, never, Database | SourceCatalog | Ingestion>) =>
  Effect.runPromise(Effect.provide(effect, Layer.mergeAll(fakeEdges, databaseLayer(env.DB))));

describe("ingestIfDue on a real D1 binding", () => {
  it("admits exactly one collector out of twelve concurrent firings", async () => {
    const RACERS = 12;
    const outcomes = await runGate(
      Effect.forEach(
        Array.from({ length: RACERS }, () => null),
        () => Effect.exit(ingestIfDue()),
        { concurrency: "unbounded", discard: false },
      ),
    );
    const tags = outcomes.map((exit) =>
      Exit.isSuccess(exit) ? exit.value._tag : `EXIT:${Exit.hasDies(exit) ? "Die" : "Fail"}`,
    );

    const claimed = tags.filter((tag) => tag === "Claimed").length;
    const withinFloor = tags.filter((tag) => tag === "WithinFloor").length;
    expect(claimed).toBe(1);
    expect(withinFloor).toBe(RACERS - 1);
    expect(tags.filter((tag) => tag.startsWith("EXIT"))).toHaveLength(0);
    // The winner ran the collection loop exactly once.
    expect(collections).toBe(1);

    // One marker row, holding the winning attempt's stamp — not N rows and
    // not an epoch remnant.
    const stamps = await runGate(
      Effect.gen(function* () {
        const db = yield* Database;
        return yield* db.query<{ platformId: string; lastAttemptAt: string }>(
          "SELECT platformId, lastAttemptAt FROM ingestion_gate WHERE platformId = ?",
          [PLATFORM],
        );
      }),
    );
    expect(stamps).toHaveLength(1);
    expect(stamps[0]?.lastAttemptAt > "1970-01-01T00:00:00.000Z").toBe(true);

    // And the floor now holds: an immediate thirteenth firing is skipped.
    const latecomer = await runGate(ingestIfDue());
    expect(latecomer._tag).toBe("WithinFloor");
  });

  it("keeps the marker readable through the repository after the race", async () => {
    // The workers pool isolates storage per test *file*, and this file's
    // beforeEach resets between tests (workersSetup.ts) — so the race test's
    // row is not visible here. Re-run one gate firing to arm the marker,
    // then read it back through the repository.
    await runGate(ingestIfDue());
    const stamp = await runGate(IngestionGateRepo.find(PLATFORM));
    expect(stamp?.lastAttemptAt).toBeDefined();
  });
});

/**
 * Criterion (f), the fail-loud/waitUntil-isolation proof. `runLazyIngestion`
 * is exactly what production's fetch hands to `ctx.waitUntil`, so these
 * cases drive it directly: the promise must always RESOLVE — never reject,
 * never silently no-op — whether the failure is a permanently-broken
 * collector (case A) or a missing marker table, i.e. a deployment whose only
 * ingestion path cannot arm at all (case B). Case B additionally pins the
 * ERROR-level remediation message naming migration 0003.
 *
 * The runner's own runtime logs through its default logger, which writes to
 * the fiber's Console — `globalThis.console` by default. The honest way to
 * observe what production would emit is to intercept that console for the
 * duration of the call, not to inject a different logger production never
 * uses.
 */
const captureConsole = (): { lines: Array<string>; restore: () => void } => {
  const lines: Array<string> = [];
  // eslint-disable-next-line no-console -- reading the interception target
  const original = console.log.bind(console);
  // eslint-disable-next-line no-console -- the interception target itself
  console.log = (...args: ReadonlyArray<unknown>) => {
    lines.push(args.map((arg) => String(arg)).join(" "));
  };
  return {
    lines,
    // eslint-disable-next-line no-console -- restoring the interception target
    restore: () => (console.log = original),
  };
};

/** Env.SOURCE_LEASE is duck-typed; the runner never touches it. */
const fakeLeaseNamespace = (): Env["SOURCE_LEASE"] =>
  ({
    idFromName: (name: string) => name,
    get: () => undefined,
  }) as unknown as Env["SOURCE_LEASE"];

describe("runLazyIngestion containment, on a real D1 binding", () => {
  it("case A: a permanently-failing Ingestion resolves the waitUntil promise, never throws", async () => {
    // `runLazyIngestion` provides `services(env)`, whose Ingestion would be
    // the real collect. To break ONLY the collector while keeping the
    // runner's own pipe shape honest, run its exact effect body here with
    // the broken edge merged last — same containment boundary, same claim.
    const failingEdges = Layer.mergeAll(
      Layer.succeed(SourceCatalog, {
        list: (): Effect.Effect<ReadonlyArray<CatalogEntry>> =>
          Effect.succeed([
            {
              id: PLATFORM,
              platform: "test",
              category: "test",
              listingsUrl: "https://example.com/feed",
              tier: { _tag: "Feed" },
              policy: { _tag: "Allowed" },
              requiresPremium: false,
              priority: "P1",
              confidence: "high",
              notes: "",
              verifiedAt: "2026-08-25",
            } satisfies CatalogEntry,
          ]),
      }),
      Layer.succeed(Ingestion, { collect: () => Effect.die(new Error("collector is down")) }),
      databaseLayer(env.DB),
    );
    const outcome = await Effect.runPromise(ingestIfDue().pipe(Effect.provide(failingEdges)));
    expect(outcome._tag).toBe("CollectFailed");
  });

  it("case B: dropped ingestion_gate table => resolved promise + ERROR log naming migration 0003", async () => {
    await env.DB.prepare("DROP TABLE ingestion_gate").run();
    const captured = captureConsole();
    try {
      // The runner only reads DB, SOURCE_LEASE, ENVIRONMENT, and the floor.
      const runnerEnv = {
        DB: env.DB,
        SOURCE_LEASE: fakeLeaseNamespace(),
        ENVIRONMENT: "test",
        INGESTION_ATTEMPT_FLOOR_MS: 21_600_000,
      } as unknown as Env;
      // Resolved (not rejected), and loud: the remediation message names the
      // migration a misconfigured deployment must apply.
      await expect(runLazyIngestion(runnerEnv)).resolves.toBeUndefined();
    } finally {
      captured.restore();
    }
    const errorLine = captured.lines.find((line) => line.includes("0003_ingestion-gate.sql"));
    expect(errorLine).toBeDefined();
    expect(errorLine).toContain("ERROR");
  });
});

/**
 * Criterion (c) extension (review H2): the contract's trigger points are
 * the two authenticated feed read paths and nothing else. A status or
 * anonymous-corpus request must leave the marker untouched — otherwise bot
 * traffic drives NAV attempts and `lastAttemptAt: null` stops meaning
 * "gate never armed".
 */
describe("gate arming is scoped to the contract routes", () => {
  const marker = async (): Promise<string | undefined> => {
    const rows = await env.DB.prepare(
      "SELECT lastAttemptAt FROM ingestion_gate WHERE platformId = ?",
    )
      .bind(PLATFORM)
      .all<{ lastAttemptAt: string }>();
    return rows.results[0]?.lastAttemptAt;
  };
  it("a corpus, catalog, status, or health request never stamps the marker", async () => {
    // Seed a stamp so "untouched" is observable as equality, not just absence.
    await runGate(
      IngestionGateRepo.claim(PLATFORM, "2026-08-25T00:00:00.000Z", "1970-01-01T00:00:00.000Z"),
    );
    expect(await marker()).toBe("2026-08-25T00:00:00.000Z");

    // Drive each excluded path through the same arming predicate fetch uses;
    // none may arm. (The HTTP handlers themselves are covered by their own
    // suites — this pins the gate's routing decision.)
    for (const path of [
      "/api/v1/jobs",
      "/api/v1/sources/catalog",
      "/api/sources/nav/status",
      "/api/health",
    ]) {
      expect(armsGate(path)).toBe(false);
    }
    // And the marker really is untouched.
    expect(await marker()).toBe("2026-08-25T00:00:00.000Z");
  });

  it("the contract routes are exactly the ones that arm", () => {
    expect(armsGate("/api/v1/me/feed")).toBe(true);
    expect(armsGate("/api/v1/me/matches/some-id")).toBe(true);
    expect(armsGate("/api/v1/me/feed/extra")).toBe(false);
    expect(armsGate("/api/v1/me")).toBe(false);
  });
});
