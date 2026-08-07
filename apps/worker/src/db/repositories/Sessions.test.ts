import { describe, expect, it } from "vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as OptionMod from "effect/Option";
import { Session } from "@job-index/domain/Access";
import { runTest as run } from "../TestLayer.ts";
import * as Sessions from "./Sessions.ts";

const now = DateTime.nowUnsafe();

// The token hash follows the id, because `sessions.tokenHash` is UNIQUE:
// two live sessions sharing one token would authenticate the wrong person,
// so a fixture that reuses a hash is describing a state the schema forbids.
const session = (id: string, revokedAt: OptionMod.Option<string> = OptionMod.none()) =>
  new Session({
    id,
    principalId: "principal-1" as never,
    profileId: "profile-1" as never,
    tokenHash: `hash-${id}`,
    expiresAt: Date.now() + 3_600_000,
    createdAt: now,
    revokedAt,
  });

describe("Sessions repository", () => {
  it("inserts and finds a session by id", async () => {
    const found = await run(
      Effect.gen(function* () {
        yield* Sessions.insert(session("s1"));
        return yield* Sessions.findById("s1");
      }),
    );
    expect(found?.id).toBe("s1");
    expect(OptionMod.isNone(found?.revokedAt ?? OptionMod.none())).toBe(true);
  });

  it("revoke — 'possession of the row must not grant access' once revokedAt is set", async () => {
    const found = await run(
      Effect.gen(function* () {
        yield* Sessions.insert(session("s1"));
        yield* Sessions.update(session("s1", OptionMod.some("2026-06-01T00:00:00.000Z")));
        return yield* Sessions.findById("s1");
      }),
    );
    expect(OptionMod.getOrUndefined(found?.revokedAt ?? OptionMod.none())).toBe(
      "2026-06-01T00:00:00.000Z",
    );
  });

  it("findByProfile lists every session for a profile", async () => {
    const rows = await run(
      Effect.gen(function* () {
        yield* Sessions.insert(session("s1"));
        yield* Sessions.insert(session("s2"));
        return yield* Sessions.findByProfile("profile-1" as never);
      }),
    );
    expect(rows).toHaveLength(2);
  });

  it("deleteByProfile removes only that profile's sessions", async () => {
    const rows = await run(
      Effect.gen(function* () {
        yield* Sessions.insert(session("s1"));
        yield* Sessions.insert(
          new Session({
            id: "s2",
            principalId: "principal-2" as never,
            profileId: "profile-2" as never,
            tokenHash: "hash2",
            expiresAt: Date.now() + 3_600_000,
            createdAt: now,
            revokedAt: OptionMod.none(),
          }),
        );
        yield* Sessions.deleteByProfile("profile-1" as never);
        const p1 = yield* Sessions.findByProfile("profile-1" as never);
        const p2 = yield* Sessions.findByProfile("profile-2" as never);
        return { p1, p2 };
      }),
    );
    expect(rows.p1).toHaveLength(0);
    expect(rows.p2).toHaveLength(1);
  });
});
