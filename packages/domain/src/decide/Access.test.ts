import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import type { AutomationPolicy } from "../Source.ts";
import type { Tier } from "../Subscription.ts";
import { canAutomate, permits } from "./Access.ts";

/**
 * These specify the product's two safety properties before anything implements
 * them. Both were inline conditionals in the previous implementation, which is
 * why they are stated as laws here rather than as examples: a law holds for
 * every input, and an example holds for the one somebody thought of.
 */

const tiers: ReadonlyArray<Tier> = [{ _tag: "Free" }, { _tag: "Premium", until: "2027-01-01" }];

const policies: ReadonlyArray<AutomationPolicy> = [
  { _tag: "Allowed" },
  { _tag: "AssistedOnly" },
  { _tag: "Prohibited" },
  { _tag: "Unreviewed" },
];

const arbTier = fc.constantFrom(...tiers);
const arbPolicy = fc.constantFrom(...policies);

describe("canAutomate", () => {
  /**
   * The property that matters commercially and legally: paying buys
   * convenience, never permission. No tier may unlock a platform that forbids
   * automation.
   */
  it("never automates against a platform that does not allow it", () => {
    fc.assert(
      fc.property(arbTier, arbPolicy, (tier, policy) => {
        const decision = canAutomate(tier, policy);
        if (policy._tag !== "Allowed") {
          expect(decision._tag).not.toBe("Allowed");
        }
      }),
    );
  });

  /** A free account is never automated, whatever the platform permits. */
  it("never automates without the capability", () => {
    fc.assert(
      fc.property(arbPolicy, (policy) => {
        expect(canAutomate({ _tag: "Free" }, policy)._tag).not.toBe("Allowed");
      }),
    );
  });

  /** Both conditions together are sufficient: the gate must not be unopenable. */
  it("automates when the tier permits and the platform allows", () => {
    const decision = canAutomate({ _tag: "Premium", until: "2027-01-01" }, { _tag: "Allowed" });
    expect(decision._tag).toBe("Allowed");
  });

  /**
   * A refusal must say which of the two conditions failed. A caller that cannot
   * distinguish "upgrade" from "this platform forbids it" will invent its own
   * wording, and those explanations drift apart across surfaces.
   */
  it("distinguishes an upgrade from a platform refusal", () => {
    expect(canAutomate({ _tag: "Free" }, { _tag: "Allowed" })._tag).toBe("NeedsUpgrade");
    expect(canAutomate({ _tag: "Premium", until: "2027-01-01" }, { _tag: "Prohibited" })._tag).toBe(
      "ForbiddenByPlatform",
    );
  });

  /** A decision is a function of its inputs only; no clock, no ambient state. */
  it("is deterministic", () => {
    fc.assert(
      fc.property(arbTier, arbPolicy, (tier, policy) => {
        expect(canAutomate(tier, policy)).toEqual(canAutomate(tier, policy));
      }),
    );
  });
});

describe("permits", () => {
  it("grants a free account nothing that costs a run", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          "model-drafting" as const,
          "automated-apply" as const,
          "agent-acquisition" as const,
          "scheduled-applications" as const,
        ),
        (capability) => {
          expect(permits({ _tag: "Free" }, capability)).toBe(false);
        },
      ),
    );
  });
});
