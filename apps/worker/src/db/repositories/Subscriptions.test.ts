import { describe, expect, it } from "vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import { Subscription } from "@job-index/domain/Subscription";
import { runTest as run } from "../TestLayer.ts";
import * as Subscriptions from "./Subscriptions.ts";

const now = DateTime.nowUnsafe();

const subscription = (tier: Subscription["tier"]) =>
  new Subscription({
    profileId: "profile-1" as never,
    tier,
    providerRef: "cus_1",
    provider: "stripe",
    updatedAt: now,
  });

describe("Subscriptions repository", () => {
  it("upserts a subscription and reads its tier back decoded", async () => {
    const found = await run(
      Effect.gen(function* () {
        yield* Subscriptions.upsert(subscription({ _tag: "Free" }));
        return yield* Subscriptions.findByProfile("profile-1" as never);
      }),
    );
    expect(found?.tier).toEqual({ _tag: "Free" });
  });

  it("upsert replaces the tier rather than accumulating rows — schema has no UNIQUE on profileId", async () => {
    const found = await run(
      Effect.gen(function* () {
        yield* Subscriptions.upsert(subscription({ _tag: "Free" }));
        yield* Subscriptions.upsert(subscription({ _tag: "Premium", until: "2027-01-01" }));
        return yield* Subscriptions.findByProfile("profile-1" as never);
      }),
    );
    expect(found?.tier).toEqual({ _tag: "Premium", until: "2027-01-01" });
  });

  it("findByProfile returns undefined for a profile with no subscription", async () => {
    const found = await run(Subscriptions.findByProfile("no-sub" as never));
    expect(found).toBeUndefined();
  });
});
