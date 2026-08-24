import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { Database } from "../services/Database.ts";
import { buildHandler } from "./testSupport.ts";

type QueryRows = {
  readonly checkpoint?: string;
  readonly failures: number;
};

const database = (rows: QueryRows): Layer.Layer<Database> =>
  Layer.succeed(Database, {
    query: <A>(sql: string, _bindings: ReadonlyArray<unknown>) =>
      Effect.succeed(
        (sql.includes("ingestion_runs")
          ? rows.checkpoint === undefined
            ? []
            : [{ startedAt: rows.checkpoint }]
          : [{ count: rows.failures }]) as unknown as ReadonlyArray<A>,
      ),
    run: () => Effect.die("unused"),
    runAffected: () => Effect.die("unused"),
    atomic: () => Effect.die("unused"),
  });

const getStatus = async (rows: QueryRows) => {
  const { handler } = buildHandler({ database: database(rows) });
  const response = await handler(new Request("http://localhost/api/sources/nav/status"));
  expect(response.status).toBe(200);
  return response.json();
};

describe("GET /api/sources/nav/status", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-13T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns zero lag and failures before NAV has any history", async () => {
    await expect(getStatus({ failures: 0 })).resolves.toEqual({
      data: { lag_seconds: null, consecutive_failures: 0 },
    });
  });

  it("computes lag from the persisted successful checkpoint and clamps clock skew to zero", async () => {
    await expect(
      getStatus({ checkpoint: "2026-08-13T11:00:00.000Z", failures: 0 }),
    ).resolves.toEqual({ data: { lag_seconds: 3600, consecutive_failures: 0 } });
    await expect(
      getStatus({ checkpoint: "2026-08-13T13:00:00.000Z", failures: 0 }),
    ).resolves.toEqual({ data: { lag_seconds: 0, consecutive_failures: 0 } });
  });

  it("counts failures newer than the latest successful checkpoint", async () => {
    await expect(
      getStatus({ checkpoint: "2026-08-13T11:00:00.000Z", failures: 2 }),
    ).resolves.toEqual({ data: { lag_seconds: 3600, consecutive_failures: 2 } });
  });

  it("resets consecutive failures after a later successful checkpoint", async () => {
    await expect(
      getStatus({ checkpoint: "2026-08-13T11:59:00.000Z", failures: 0 }),
    ).resolves.toEqual({ data: { lag_seconds: 60, consecutive_failures: 0 } });
  });
});
