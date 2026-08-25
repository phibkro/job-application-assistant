import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type { PlatformId, Sequence } from "@job-index/domain/Ids";
import type { AcquisitionTier, CatalogEntry } from "@job-index/domain/Source";
import { Database } from "../services/Database.ts";
import { Ingestion } from "../services/Ingestion.ts";
import type { RunBudget, RunReport } from "../services/Ingestion.ts";
import { SourceCatalog } from "../services/SourceCatalog.ts";
import { attemptDue, DEFAULT_RUN_BUDGET, ingestIfDue } from "./lazy.ts";

const PLATFORM = "arbeidsplassen-nav" as PlatformId;

const entry = (id: string, tier: AcquisitionTier["_tag"]): CatalogEntry => ({
  id: id as PlatformId,
  platform: id,
  category: "test",
  listingsUrl: `https://example.com/${id}`,
  tier: { _tag: tier } as AcquisitionTier,
  policy: { _tag: "Unreviewed" },
  requiresPremium: tier === "Agent",
  priority: "P1",
  confidence: "high",
  notes: "",
  verifiedAt: "2026-08-11",
});

const report = (stoppedReason = "reached tail"): RunReport => ({
  pages: 1,
  observations: 5,
  canonicalChanges: 3,
  cursorBefore: "a",
  cursorAfter: "b",
  highestSequence: 1 as Sequence,
  stoppedReason,
  durationMs: 10,
});

/**
 * A real in-memory `Database`: the gate's claim runs through
 * `atomicAffected`, so the unit tests exercise the actual CAS semantics a
 * real D1 would apply — not a canned true/false.
 */
const memoryDatabase = (): Layer.Layer<Database> =>
  Layer.succeed(Database, {
    query: <A>(sql: string, bindings: ReadonlyArray<unknown>) =>
      Effect.sync(() => {
        if (sql.includes("SELECT lastAttemptAt FROM ingestion_gate")) {
          const row = rows.get(bindings[0] as string);
          return (row === undefined ? [] : [{ lastAttemptAt: row }]) as unknown as ReadonlyArray<A>;
        }
        return [] as unknown as ReadonlyArray<A>;
      }),
    run: () => Effect.die("unused"),
    runAffected: () => Effect.die("unused"),
    atomicAffected: (writes) =>
      Effect.sync(() => {
        const seed = writes[0];
        const claimWrite = writes[1];
        if (
          seed === undefined ||
          claimWrite === undefined ||
          !seed.sql.includes("INSERT OR IGNORE INTO ingestion_gate")
        ) {
          throw new Error("gate tests expect the two-statement claim batch");
        }
        // Seed only when absent — INSERT OR IGNORE, not INSERT: an eager
        // set here would reset a fresh stamp every firing and the floor
        // would never hold.
        if (!rows.has(seed.bindings[0] as string)) {
          rows.set(seed.bindings[0] as string, EPOCH_STAMP);
        }
        const [nowIso, platformId, cutoffIso] = claimWrite.bindings as [string, string, string];
        if (!claimWrite.sql.includes("lastAttemptAt <= ?")) {
          throw new Error("claim statement lost its guard");
        }
        const current = rows.get(platformId) ?? EPOCH_STAMP;
        const won = current <= cutoffIso;
        if (won) {
          rows.set(platformId, nowIso);
        }
        return [0, won ? 1 : 0];
      }),
    atomic: () => Effect.die("unused"),
  });

const EPOCH_STAMP = "1970-01-01T00:00:00.000Z";
const rows = new Map<string, string>();

interface Harness {
  readonly collected: Array<{ platform: PlatformId; budget: RunBudget }>;
  readonly collectScript: Array<"ok" | "lease" | "fail">;
}

const harness = (
  script: Array<"ok" | "lease" | "fail"> = ["ok"],
): Harness & {
  readonly layer: Layer.Layer<SourceCatalog | Ingestion>;
} => {
  const h: Harness = { collected: [], collectScript: script };
  const nav = entry(PLATFORM, "Feed");
  const agentOnly = entry("agent-only", "Agent");
  const layer = Layer.mergeAll(
    Layer.succeed(SourceCatalog, {
      list: (tier) => Effect.succeed(tier?._tag === "Feed" ? [nav] : [agentOnly, nav]),
    }),
    Layer.succeed(Ingestion, {
      collect: (platform, budget) => {
        h.collected.push({ platform, budget });
        const next = script.shift() ?? "ok";
        return next === "lease"
          ? Effect.fail({ _tag: "LeaseHeld" } as never)
          : next === "fail"
            ? Effect.die(new Error("collect exploded"))
            : Effect.succeed(report());
      },
    }),
  );
  return { ...h, layer };
};

const gateLayer = (h: ReturnType<typeof harness>) => Layer.mergeAll(h.layer, memoryDatabase());

beforeEach(() => {
  rows.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-25T12:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("attemptDue", () => {
  it("is due when never attempted", () => {
    expect(attemptDue(undefined, "2026-08-25T06:00:00.000Z")).toBe(true);
  });

  it("is not due inside the floor and due at or past it", () => {
    const cutoff = "2026-08-25T06:00:00.000Z";
    expect(attemptDue("2026-08-25T07:00:00.000Z", cutoff)).toBe(false);
    expect(attemptDue(cutoff, cutoff)).toBe(true);
    expect(attemptDue("2026-08-25T05:59:59.999Z", cutoff)).toBe(true);
  });

  it("treats an unparseable stamp as due rather than throwing", () => {
    expect(attemptDue("not-a-timestamp", "2026-08-25T06:00:00.000Z")).toBe(true);
  });
});

describe("ingestIfDue", () => {
  it("claims on first use, collects only Feed sources with the shared budget, and stamps now", async () => {
    const h = harness(["ok"]);
    const outcome = await Effect.runPromise(ingestIfDue().pipe(Effect.provide(gateLayer(h))));
    expect(outcome._tag).toBe("Claimed");
    expect(h.collected.map((call) => call.platform)).toEqual([PLATFORM]);
    // The shared budget, byte-identical to the cron-era constant.
    expect(h.collected[0]?.budget).toEqual(DEFAULT_RUN_BUDGET);
    expect(rows.get(PLATFORM)).toBe("2026-08-25T12:00:00.000Z");
  });

  it("skips within the floor without collecting again", async () => {
    await Effect.runPromise(ingestIfDue().pipe(Effect.provide(gateLayer(harness()))));
    vi.setSystemTime(new Date("2026-08-25T15:00:00.000Z")); // +3h < 6h floor
    const second = await Effect.runPromise(
      ingestIfDue().pipe(Effect.provide(gateLayer(harness()))),
    );
    expect(second._tag).toBe("WithinFloor");
  });

  it("fires again once the floor expires", async () => {
    await Effect.runPromise(ingestIfDue().pipe(Effect.provide(gateLayer(harness()))));
    vi.setSystemTime(new Date("2026-08-25T19:00:00.000Z")); // +7h > 6h floor
    const second = await Effect.runPromise(
      ingestIfDue().pipe(Effect.provide(gateLayer(harness()))),
    );
    expect(second._tag).toBe("Claimed");
  });

  it("reports LeaseHeld as data, keeps the attempt stamp, and never throws", async () => {
    const first = harness(["lease"]);
    const outcome = await Effect.runPromise(ingestIfDue().pipe(Effect.provide(gateLayer(first))));
    expect(outcome).toEqual({ _tag: "LeaseHeld" });
    // The window is spent even though nothing was collected.
    expect(rows.get(PLATFORM)).toBe("2026-08-25T12:00:00.000Z");
    vi.setSystemTime(new Date("2026-08-25T13:00:00.000Z"));
    const retry = await Effect.runPromise(
      ingestIfDue().pipe(Effect.provide(gateLayer(harness(["ok"])))),
    );
    expect(retry._tag).toBe("WithinFloor");
  });

  it("survives a collect defect: failure surfaces as CollectFailed, stamp kept", async () => {
    const failing = harness(["fail"]);
    const outcome = await Effect.runPromise(ingestIfDue().pipe(Effect.provide(gateLayer(failing))));
    expect(outcome._tag).toBe("CollectFailed");
    expect(rows.get(PLATFORM)).toBe("2026-08-25T12:00:00.000Z");
  });
});
