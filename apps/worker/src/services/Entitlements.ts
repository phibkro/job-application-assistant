import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { EntitlementRequired } from "@job-index/domain/Failure";
import type { UserId } from "@job-index/domain/Ids";

/**
 * What an account's subscription permits.
 *
 * A service rather than a field test, so the answer is asked for at the moment
 * it matters instead of being read once and remembered. A schedule created
 * while premium must stop working when the subscription lapses, which only
 * holds if the question is re-asked on every run.
 *
 * Capabilities are named rather than boolean-per-tier: adding one should not
 * require every call site to learn a new tier.
 */
export type Capability =
  | "model-drafting"
  | "automated-apply"
  | "agent-acquisition"
  | "scheduled-applications";

export class Entitlements extends Context.Service<
  Entitlements,
  {
    /** Whether the account currently holds the capability. */
    readonly has: (user: UserId, capability: Capability) => Effect.Effect<boolean>;

    /**
     * Fails with `EntitlementRequired` when the account does not hold it, so a
     * gate is one `yield*` rather than an if-statement a caller may forget.
     */
    readonly require: (
      user: UserId,
      capability: Capability,
    ) => Effect.Effect<void, EntitlementRequired>;
  }
>()("@job-index/Entitlements") {}
