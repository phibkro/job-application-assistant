import * as Schema from "effect/Schema";
import type { AutomationPolicy } from "../Source.ts";
import type { Capability, Tier } from "../Subscription.ts";

/**
 * The decisions, as pure functions over data.
 *
 * These were services in the first sketch. They are not: they consult nothing
 * and perform nothing, so making them services would have forced every test to
 * build a layer to answer a question that is a `match` over two values. The
 * shell fetches tier and policy; this decides; the shell obeys.
 *
 * Both questions must be asked for an automated submission, and they are
 * different questions. Entitlement is commercial and policy is contractual, so
 * collapsing them would let a subscription buy permission a platform never
 * granted.
 */

export const Decision = Schema.Union([
  Schema.TaggedStruct("Allowed", {}),
  Schema.TaggedStruct("NeedsUpgrade", { capability: Schema.String }),
  Schema.TaggedStruct("ForbiddenByPlatform", { policy: Schema.String }),
]);
export type Decision = typeof Decision.Type;

const grants: Record<Tier["_tag"], ReadonlyArray<Capability>> = {
  Free: [],
  Premium: ["model-drafting", "automated-apply", "agent-acquisition", "scheduled-applications"],
};

/** Whether the tier includes the capability. Total, and trivially testable. */
export const permits = (tier: Tier, capability: Capability): boolean =>
  grants[tier._tag].includes(capability);

/**
 * Whether an application may be submitted automatically.
 *
 * Returns why, not merely whether: a refusal that cannot explain itself
 * becomes an error message someone invents at the call site, and those drift.
 *
 * ```ts import.meta.vitest
 * const premium = { _tag: "Premium", until: "2027-01-01" } as const
 *
 * // Paying is not permission: the platform decides.
 * canAutomate(premium, { _tag: "Prohibited" })._tag // => "ForbiddenByPlatform"
 *
 * // Permission is not payment: the tier decides.
 * canAutomate({ _tag: "Free" }, { _tag: "Allowed" })._tag // => "NeedsUpgrade"
 *
 * // Both, and only both.
 * canAutomate(premium, { _tag: "Allowed" })._tag // => "Allowed"
 * ```
 */
export const canAutomate = (tier: Tier, policy: AutomationPolicy): Decision => {
  if (!permits(tier, "automated-apply")) {
    return { _tag: "NeedsUpgrade", capability: "automated-apply" };
  }
  return policy._tag === "Allowed"
    ? { _tag: "Allowed" }
    : { _tag: "ForbiddenByPlatform", policy: policy._tag };
};

if (import.meta.vitest) {
  const { it, expect } = import.meta.vitest;
  const premium = { _tag: "Premium", until: "2027-01-01" } as const;

  it("documents the two conditions truthfully", () => {
    expect(canAutomate(premium, { _tag: "Prohibited" })._tag).toBe("ForbiddenByPlatform");
    expect(canAutomate({ _tag: "Free" }, { _tag: "Allowed" })._tag).toBe("NeedsUpgrade");
    expect(canAutomate(premium, { _tag: "Allowed" })._tag).toBe("Allowed");
  });
}
