import type { AutomationPolicy } from "@job-index/domain/Source";
import type { Tier } from "@job-index/domain/Subscription";
import type { PlatformId } from "@job-index/domain/Ids";
import { canAutomate } from "@job-index/domain/decide/Access";
import type { Method } from "../services/Applications.ts";

/**
 * The pure heart of `prepare`: given what the tier and the platform's policy
 * permit, decide what `prepare` should actually do. Total, and a function of
 * its arguments only, so the load-bearing behaviour — a downgrade is a
 * success, an unreviewed platform never automates, entitlement and policy
 * gate independently — is provable with plain objects rather than a live
 * layer.
 *
 * `AutomationPolicy.Prohibited` is not "automation forbidden": `AssistedOnly`
 * already says that. It is the platform saying none of this tooling may touch
 * the listing at all, so it blocks unconditionally — before `requested` is
 * even consulted, and regardless of what the account has paid for. Every
 * other non-`Allowed` policy narrows only the `automated` path; `assisted`
 * proceeds untouched, because a person submitting by hand is not automation.
 */
export type PreparationDecision =
  | { readonly _tag: "Blocked"; readonly platform: PlatformId; readonly policy: string }
  | { readonly _tag: "NeedsUpgrade"; readonly capability: string }
  | {
      readonly _tag: "Proceed";
      readonly method: Method;
      readonly downgradeReason?: string;
    };

export const decidePreparation = (
  tier: Tier,
  platform: PlatformId,
  policy: AutomationPolicy,
  requested: Method,
): PreparationDecision => {
  if (policy._tag === "Prohibited") {
    return { _tag: "Blocked", platform, policy: policy._tag };
  }

  if (requested === "assisted") {
    return { _tag: "Proceed", method: "assisted" };
  }

  // `canAutomate` is the frozen, shared decision for "may this tier
  // automate against this policy" — reused rather than restated so
  // `Applications` and any other caller of it agree by construction.
  const decision = canAutomate(tier, policy);
  switch (decision._tag) {
    case "Allowed":
      return { _tag: "Proceed", method: "automated" };
    case "NeedsUpgrade":
      return { _tag: "NeedsUpgrade", capability: decision.capability };
    case "ForbiddenByPlatform":
      return {
        _tag: "Proceed",
        method: "assisted",
        downgradeReason: `${platform}: ${decision.policy}`,
      };
  }
};

/**
 * Whether a tier is currently in force. `Tier.Premium` carries `until`
 * because entitlement must be re-asked on every run, not read once and
 * remembered — a lapsed subscription has to stop granting the moment it
 * lapses, and the only way that holds is if expiry is checked here, at the
 * point of use, against the caller's own clock.
 */
export const effectiveTier = (tier: Tier, now: Date): Tier =>
  tier._tag === "Premium" && new Date(tier.until).getTime() < now.getTime()
    ? { _tag: "Free" }
    : tier;

if (import.meta.vitest) {
  const { it, expect } = import.meta.vitest;

  it("a lapsed premium subscription is free again", () => {
    const lapsed: Tier = { _tag: "Premium", until: "2020-01-01" };
    expect(effectiveTier(lapsed, new Date("2026-01-01"))).toEqual({ _tag: "Free" });
  });
}
