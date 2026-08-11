import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type { HydratedCanonicalJob } from "@job-index/domain/Job";
import type { CanonicalJobId, ProfileId, SavedJobId, SourceId } from "@job-index/domain/Ids";
import { layerSqlite } from "../db/Sqlite.ts";
import { Database } from "../services/Database.ts";
import { Ids } from "../services/Ids.ts";
import { SavedJobs } from "../services/SavedJobs.ts";
import { layer as savedJobsLayer } from "./savedJobsService.ts";

const job: HydratedCanonicalJob = {
  id: "job-1" as CanonicalJobId,
  title: "Baker",
  employerName: "Bakery AS",
  location: "Oslo",
  applicationUrl: "https://jobs.webcruiter.no/vacancy/1",
  publishedAt: "2026-01-01T00:00:00Z",
  status: { _tag: "Active" },
  sequence: 1 as never,
  changedAt: "2026-01-01T00:00:00Z",
  sources: ["nav" as SourceId],
  hydration: { _tag: "Hydrated", description: "Bakes bread." },
};

describe("SavedJobs.save against a fixed Ids", () => {
  it("mints exactly the id Ids.next hands it — a test `crypto.randomUUID()` read ambiently could never fix", async () => {
    const fixedId = "fixed-saved-job-id" as SavedJobId;
    const layer = savedJobsLayer.pipe(
      Layer.provideMerge(
        Layer.mergeAll(Layer.succeed(Ids, { next: Effect.succeed(fixedId) }), layerSqlite()),
      ),
    );

    const id = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const savedJobs = yield* SavedJobs;
          return yield* savedJobs.save("profile-1" as ProfileId, job, "");
        }),
        layer,
      ),
    );

    expect(id).toBe(fixedId);
  });
});

describe("SavedJobs.save replacement", () => {
  it("upserts one owner/canonical bookmark, preserving its id and creation time", async () => {
    let calls = 0;
    const layer = savedJobsLayer.pipe(
      Layer.provideMerge(
        Layer.mergeAll(
          Layer.succeed(Ids, {
            next: Effect.sync(() => (calls++ === 0 ? "saved-first" : "saved-discarded")),
          }),
          layerSqlite(),
        ),
      ),
    );

    const result = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const savedJobs = yield* SavedJobs;
          const first = yield* savedJobs.save("profile-1" as ProfileId, job, "first note");
          const second = yield* savedJobs.save("profile-1" as ProfileId, job, "replacement note");
          const db = yield* Database;
          const rows = yield* db.query<{
            readonly id: string;
            readonly profileId: string;
            readonly canonicalJobId: string;
            readonly note: string;
            readonly createdAt: string;
          }>(
            "SELECT id, profileId, canonicalJobId, note, createdAt FROM saved_jobs WHERE profileId = ?",
            ["profile-1"],
          );
          return { first, second, rows };
        }),
        layer,
      ),
    );

    expect(result.first).toBe("saved-first");
    expect(result.second).toBe("saved-first");
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      id: "saved-first",
      profileId: "profile-1",
      canonicalJobId: "job-1",
      note: "replacement note",
    });
    expect(result.rows[0]?.createdAt).toBeTruthy();
  });
});
