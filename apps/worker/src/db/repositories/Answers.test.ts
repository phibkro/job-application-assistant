import { describe, expect, it } from "vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import { Answer } from "@job-index/domain/Answer";
import { runTest as run } from "../TestLayer.ts";
import * as Answers from "./Answers.ts";

const now = DateTime.nowUnsafe();

const answer = (overrides: Partial<{ value: string; question: string }> = {}) =>
  new Answer({
    profileId: "profile-1" as never,
    question: (overrides.question ?? "years-experience") as never,
    label: "Years of experience",
    shape: { _tag: "Number" },
    value: overrides.value ?? "5",
    origin: "stated",
    createdAt: now,
    updatedAt: now,
  });

describe("Answers repository", () => {
  it("upserts an answer and reads it back with its real value shape decoded", async () => {
    const result = await run(
      Effect.gen(function* () {
        yield* Answers.upsert(answer());
        return yield* Answers.findOne("profile-1" as never, "years-experience" as never);
      }),
    );
    expect(result?.value).toBe("5");
    expect(result?.shape).toEqual({ _tag: "Number" });
  });

  it("upsert replaces the prior value for the same (profileId, question) — schema has no UNIQUE to lean on", async () => {
    const rows = await run(
      Effect.gen(function* () {
        yield* Answers.upsert(answer({ value: "5" }));
        yield* Answers.upsert(answer({ value: "6" }));
        return yield* Answers.findByProfile("profile-1" as never);
      }),
    );
    // Exactly one row survives — proves upsert's delete-then-insert actually
    // enforces "at most one row per key" despite the missing DB constraint.
    expect(rows).toHaveLength(1);
    expect(rows[0]?.value).toBe("6");
  });

  it("keeps distinct questions as distinct rows", async () => {
    const rows = await run(
      Effect.gen(function* () {
        yield* Answers.upsert(answer({ question: "years-experience" }));
        yield* Answers.upsert(answer({ question: "notice-period" }));
        return yield* Answers.findByProfile("profile-1" as never);
      }),
    );
    expect(rows).toHaveLength(2);
  });

  it("findOne returns undefined for a question never answered", async () => {
    const result = await run(Answers.findOne("profile-1" as never, "never-asked" as never));
    expect(result).toBeUndefined();
  });

  it("deleteByProfile removes every answer for that profile only", async () => {
    const rows = await run(
      Effect.gen(function* () {
        yield* Answers.upsert(answer({ question: "a" }));
        yield* Answers.upsert(
          new Answer({
            profileId: "profile-2" as never,
            question: "a" as never,
            label: "L",
            shape: { _tag: "Text" },
            value: "x",
            origin: "stated",
            createdAt: now,
            updatedAt: now,
          }),
        );
        yield* Answers.deleteByProfile("profile-1" as never);
        const remainingP1 = yield* Answers.findByProfile("profile-1" as never);
        const remainingP2 = yield* Answers.findByProfile("profile-2" as never);
        return { remainingP1, remainingP2 };
      }),
    );
    expect(rows.remainingP1).toHaveLength(0);
    expect(rows.remainingP2).toHaveLength(1);
  });
});
