import { describe, expect, it } from "vitest";
import type { AutomationPolicy } from "@job-index/domain/Source";
import type { Tier } from "@job-index/domain/Subscription";
import type { PlatformId } from "@job-index/domain/Ids";
import { decidePreparation, effectiveTier } from "./decide.ts";

const platform = "webcruiter" as PlatformId;
const free: Tier = { _tag: "Free" };
const premium: Tier = { _tag: "Premium", until: "2027-01-01" };

const policy = (tag: AutomationPolicy["_tag"]): AutomationPolicy => ({ _tag: tag }) as never;

describe("decidePreparation", () => {
  it("a downgrade is reported as a downgrade, not a failure", () => {
    const decision = decidePreparation(premium, platform, policy("AssistedOnly"), "automated");
    expect(decision).toEqual({
      _tag: "Proceed",
      method: "assisted",
      downgradeReason: "webcruiter: AssistedOnly",
    });
  });

  it("an unreviewed platform never automates, however the account pays", () => {
    const decision = decidePreparation(premium, platform, policy("Unreviewed"), "automated");
    expect(decision._tag).toBe("Proceed");
    expect(decision).toMatchObject({ method: "assisted" });
  });

  it("an entitlement gate is not a policy gate: a free account cannot automate an allowed platform", () => {
    const decision = decidePreparation(free, platform, policy("Allowed"), "automated");
    expect(decision).toEqual({ _tag: "NeedsUpgrade", capability: "automated-apply" });
  });

  it("policy gates independently of entitlement: a paying account still cannot automate a prohibited one", () => {
    const decision = decidePreparation(premium, platform, policy("Prohibited"), "automated");
    expect(decision).toEqual({ _tag: "Blocked", platform, policy: "Prohibited" });
  });

  it("a prohibited platform blocks even a free account before entitlement is asked", () => {
    // If entitlement were checked first this would read NeedsUpgrade instead
    // of Blocked, hiding the platform's veto behind a paywall prompt.
    const decision = decidePreparation(free, platform, policy("Prohibited"), "automated");
    expect(decision).toEqual({ _tag: "Blocked", platform, policy: "Prohibited" });
  });

  it("a prohibited platform blocks assisted requests too: nothing may touch this listing", () => {
    const decision = decidePreparation(premium, platform, policy("Prohibited"), "assisted");
    expect(decision).toEqual({ _tag: "Blocked", platform, policy: "Prohibited" });
  });

  it("assisted proceeds regardless of tier or policy, short of Prohibited", () => {
    for (const tier of [free, premium]) {
      for (const tag of ["Allowed", "AssistedOnly", "Unreviewed"] as const) {
        expect(decidePreparation(tier, platform, policy(tag), "assisted")).toEqual({
          _tag: "Proceed",
          method: "assisted",
        });
      }
    }
  });

  it("both conditions together are sufficient: automated proceeds with no downgrade", () => {
    const decision = decidePreparation(premium, platform, policy("Allowed"), "automated");
    expect(decision).toEqual({ _tag: "Proceed", method: "automated" });
  });
});

describe("effectiveTier", () => {
  it("an active premium subscription stays premium", () => {
    const active: Tier = { _tag: "Premium", until: "2027-01-01" };
    expect(effectiveTier(active, new Date("2026-01-01"))).toEqual(active);
  });

  it("free stays free", () => {
    expect(effectiveTier({ _tag: "Free" }, new Date("2026-01-01"))).toEqual({ _tag: "Free" });
  });

  it("the instant `until` reads: still premium; the instant after: lapsed", () => {
    // The boundary itself, not just "well before" vs "well after" — this is
    // the test `entitlements.ts` reading `new Date()` ambiently made
    // unwritable: `effectiveTier` takes `now`, so the exact expiry instant is
    // fixable and assertable.
    const until: Tier = { _tag: "Premium", until: "2026-06-15T12:00:00.000Z" };
    expect(effectiveTier(until, new Date("2026-06-15T12:00:00.000Z"))).toEqual(until);
    expect(effectiveTier(until, new Date("2026-06-15T12:00:00.001Z"))).toEqual({ _tag: "Free" });
  });
});
