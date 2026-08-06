import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { AutomationPolicy } from "@job-index/domain/Source";
import type { PolicyProhibited } from "@job-index/domain/Failure";
import type { CanonicalJobId, PlatformId } from "@job-index/domain/Ids";

/**
 * What a platform permits, independent of what an account has paid for.
 *
 * Separate from `Entitlements` on purpose. Automated submission requires both
 * to say yes, and they answer different questions: entitlement is commercial,
 * policy is contractual. Collapsing them would let a subscription buy
 * permission a platform never granted.
 *
 * An unmatched platform resolves to `Unreviewed`, which forbids automation.
 */
export class Policy extends Context.Service<
  Policy,
  {
    /** The recorded policy for the platform that advertised this vacancy. */
    readonly forJob: (
      job: CanonicalJobId,
    ) => Effect.Effect<{ platform: PlatformId; policy: AutomationPolicy }>;

    /**
     * Fails unless the platform's recorded policy is `Allowed`. The failure
     * carries the platform and policy so the caller can explain the downgrade
     * to assisted rather than reporting a bare refusal.
     */
    readonly requireAutomatable: (job: CanonicalJobId) => Effect.Effect<void, PolicyProhibited>;
  }
>()("@job-index/Policy") {}
