import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import type { PlatformId } from "@job-index/domain/Ids";
import { Database } from "../../services/Database.ts";
import { runTest as run } from "../TestLayer.ts";
import * as IngestionStatus from "./IngestionStatus.ts";

const NAV = "arbeidsplassen-nav" as PlatformId;

const insert = (sql: string, bindings: ReadonlyArray<unknown>) =>
  Effect.gen(function* () {
    const database = yield* Database;
    yield* database.run(sql, bindings);
  });

describe("IngestionStatus repository", () => {
  it("returns zero state before the source has any history", async () => {
    await expect(run(IngestionStatus.find(NAV))).resolves.toEqual({
      checkpointAt: undefined,
      consecutiveFailures: 0,
    });
  });

  it("counts only failures strictly newer than the successful checkpoint", async () => {
    const state = await run(
      Effect.gen(function* () {
        yield* insert(
          "INSERT INTO ingestion_runs (platformId, startedAt, pages, observations, canonicalChanges, cursorBefore, cursorAfter, highestSequence, stoppedReason, durationMs) VALUES (?, ?, 1, 1, 1, ?, ?, 1, ?, 100)",
          [
            NAV,
            "2026-08-13T11:00:00.000Z",
            "/api/v1/feed",
            "/api/v1/feed?page=2",
            "budget exhausted: pages",
          ],
        );
        for (const occurredAt of [
          "2026-08-13T10:59:00.000Z",
          "2026-08-13T11:00:00.000Z",
          "2026-08-13T11:01:00.000Z",
          "2026-08-13T11:02:00.000Z",
        ]) {
          yield* insert(
            "INSERT INTO ingestion_failures (platformId, occurredAt, failureTag, cursor) VALUES (?, ?, ?, ?)",
            [NAV, occurredAt, "SourceUnavailable", "/api/v1/feed?page=2"],
          );
        }
        yield* insert(
          "INSERT INTO ingestion_runs (platformId, startedAt, pages, observations, canonicalChanges, cursorBefore, cursorAfter, highestSequence, stoppedReason, durationMs) VALUES (?, ?, 0, 0, 0, ?, ?, 1, ?, 100)",
          [
            NAV,
            "2026-08-13T11:03:00.000Z",
            "/api/v1/feed?page=2",
            "/api/v1/feed?page=2",
            "failed: Unauthorized (credentials rejected)",
          ],
        );
        yield* insert(
          "INSERT INTO ingestion_runs (platformId, startedAt, pages, observations, canonicalChanges, cursorBefore, cursorAfter, highestSequence, stoppedReason, durationMs) VALUES (?, ?, 0, 0, 0, ?, ?, 1, ?, 100)",
          [
            NAV,
            "2026-08-13T11:04:00.000Z",
            "/api/v1/feed?page=2",
            "/api/v1/feed?page=2",
            "budget exhausted: duration",
          ],
        );
        return yield* IngestionStatus.find(NAV);
      }),
    );

    expect(state).toEqual({
      checkpointAt: "2026-08-13T11:00:00.000Z",
      consecutiveFailures: 2,
    });
  });

  it("counts all failures when no successful checkpoint exists", async () => {
    const state = await run(
      Effect.gen(function* () {
        yield* insert(
          "INSERT INTO ingestion_failures (platformId, occurredAt, failureTag, cursor) VALUES (?, ?, ?, ?)",
          [NAV, "2026-08-13T11:01:00.000Z", "SourceUnavailable", "/api/v1/feed"],
        );
        return yield* IngestionStatus.find(NAV);
      }),
    );

    expect(state).toEqual({ checkpointAt: undefined, consecutiveFailures: 1 });
  });
});
