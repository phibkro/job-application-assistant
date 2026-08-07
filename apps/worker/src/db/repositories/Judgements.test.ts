import { describe, expect, it } from "vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import { Judgement } from "@job-index/domain/Freshness";
import { runTest as run } from "../TestLayer.ts";
import * as Judgements from "./Judgements.ts";

const now = DateTime.nowUnsafe();

const judgement = (jobId: string, verdict: Judgement["verdict"] = "dismissed") =>
  new Judgement({
    profileId: "profile-1" as never,
    jobId: jobId as never,
    verdict,
    reason: "not relevant",
    createdAt: now,
  });

describe("Judgements repository", () => {
  it("records a judgement and finds it by profile", async () => {
    const rows = await run(
      Effect.gen(function* () {
        yield* Judgements.record(judgement("job-1"));
        return yield* Judgements.findByProfile("profile-1" as never);
      }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.verdict).toBe("dismissed");
  });

  it("keeps every judgement on the same job — a changed mind is history, not an overwrite", async () => {
    const rows = await run(
      Effect.gen(function* () {
        yield* Judgements.record(judgement("job-1", "not_now"));
        yield* Judgements.record(judgement("job-1", "irrelevant"));
        return yield* Judgements.findByJob("profile-1" as never, "job-1" as never);
      }),
    );
    expect(rows).toHaveLength(2);
  });

  it("findByProfile scopes to the given profile only", async () => {
    const rows = await run(
      Effect.gen(function* () {
        yield* Judgements.record(judgement("job-1"));
        yield* Judgements.record(
          new Judgement({
            profileId: "profile-2" as never,
            jobId: "job-1" as never,
            verdict: "dismissed",
            reason: "",
            createdAt: now,
          }),
        );
        return yield* Judgements.findByProfile("profile-1" as never);
      }),
    );
    expect(rows).toHaveLength(1);
  });
});
