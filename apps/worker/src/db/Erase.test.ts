import { describe, expect, it } from "vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as OptionMod from "effect/Option";
import { Answer } from "@job-index/domain/Answer";
import { Session } from "@job-index/domain/Access";
import { eraseProfile } from "./Erase.ts";
import * as Answers from "./repositories/Answers.ts";
import * as Sessions from "./repositories/Sessions.ts";
import { runTest as run } from "./TestLayer.ts";

const now = DateTime.nowUnsafe();

describe("eraseProfile", () => {
  it("removes a profile's answers and sessions, leaving another profile's data untouched", async () => {
    const outcome = await run(
      Effect.gen(function* () {
        yield* Answers.upsert(
          new Answer({
            profileId: "erase-me" as never,
            question: "q" as never,
            label: "L",
            shape: { _tag: "Text" },
            value: "secret",
            origin: "stated",
            createdAt: now,
            updatedAt: now,
          }),
        );
        yield* Sessions.insert(
          new Session({
            id: "s1",
            principalId: "principal-1" as never,
            profileId: "erase-me" as never,
            tokenHash: "hash",
            expiresAt: Date.now() + 3_600_000,
            createdAt: now,
            revokedAt: OptionMod.none(),
          }),
        );
        yield* Answers.upsert(
          new Answer({
            profileId: "keep-me" as never,
            question: "q" as never,
            label: "L",
            shape: { _tag: "Text" },
            value: "kept",
            origin: "stated",
            createdAt: now,
            updatedAt: now,
          }),
        );

        yield* eraseProfile("erase-me" as never);

        return {
          erasedAnswers: yield* Answers.findByProfile("erase-me" as never),
          erasedSessions: yield* Sessions.findByProfile("erase-me" as never),
          keptAnswers: yield* Answers.findByProfile("keep-me" as never),
        };
      }),
    );
    expect(outcome.erasedAnswers).toHaveLength(0);
    expect(outcome.erasedSessions).toHaveLength(0);
    expect(outcome.keptAnswers).toHaveLength(1);
  });
});
