import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type { CanonicalJob } from "@job-index/domain/Job";
import type { CanonicalJobId, ProfileId, SavedJobId, SourceId } from "@job-index/domain/Ids";
import { layerSqlite } from "../db/Sqlite.ts";
import { Ids } from "../services/Ids.ts";
import { SavedJobs } from "../services/SavedJobs.ts";
import { layer as savedJobsLayer } from "./savedJobsService.ts";

const job: CanonicalJob = {
  id: "job-1" as CanonicalJobId,
  title: "Baker",
  employerName: "Bakery AS",
  location: "Oslo",
  description: "Bakes bread.",
  applicationUrl: "https://jobs.webcruiter.no/vacancy/1",
  publishedAt: "2026-01-01T00:00:00Z",
  status: { _tag: "Active" },
  sequence: 1 as never,
  changedAt: "2026-01-01T00:00:00Z",
  sources: ["nav" as SourceId],
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
