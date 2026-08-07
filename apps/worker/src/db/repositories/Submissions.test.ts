import { describe, expect, it } from "vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import { Submission } from "@job-index/domain/Delivery";
import { runTest as run } from "../TestLayer.ts";
import * as Submissions from "./Submissions.ts";

const now = DateTime.nowUnsafe();

const submission = (id: string, outcome: Submission["outcome"] = "submitted") =>
  new Submission({
    id: id as never,
    profileId: "profile-1" as never,
    platformId: "finn" as never,
    applicationUrl: "https://finn.no/apply/1",
    viaTier: { _tag: "Scripted" },
    outcome,
    humanIntervened: false,
    unanswered: [],
    detail: "",
    createdAt: now,
  });

describe("Submissions repository", () => {
  it("inserts and finds a submission by id", async () => {
    const found = await run(
      Effect.gen(function* () {
        yield* Submissions.insert(submission("s1"));
        return yield* Submissions.findById("s1" as never);
      }),
    );
    expect(found?.outcome).toBe("submitted");
    expect(found?.humanIntervened).toBe(false);
  });

  it("keeps every attempt for a profile — append-only, so two attempts means two rows", async () => {
    const rows = await run(
      Effect.gen(function* () {
        yield* Submissions.insert(submission("s1", "failed"));
        yield* Submissions.insert(submission("s2", "submitted"));
        return yield* Submissions.findByProfile("profile-1" as never);
      }),
    );
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.outcome).toSorted()).toEqual(["failed", "submitted"]);
  });

  it("findById returns undefined for an unknown id", async () => {
    const found = await run(Submissions.findById("unknown" as never));
    expect(found).toBeUndefined();
  });
});
