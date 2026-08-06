import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { CanonicalJob } from "@job-index/domain/Job";
import type { Profile } from "@job-index/domain/Profile";
import type { ProfileIncomplete } from "@job-index/domain/Failure";

/**
 * Composing a CV and a covering letter for one vacancy.
 *
 * Two implementations satisfy this: a deterministic composer available to
 * every account, and a model-assisted one that costs an inference call and is
 * therefore premium. The interface is identical because the output is the
 * same kind of thing — a subscription buys better prose, not a different
 * product.
 *
 * Entitlement is checked before this service is reached. It does not know
 * what the caller has paid for, which is what lets the template implementation
 * be substituted in tests without a subscription.
 */
export interface Documents {
  readonly cv: string;
  readonly letter: string;
  readonly generator: "template" | "model";
}

export class Drafting extends Context.Service<
  Drafting,
  {
    readonly compose: (
      profile: Profile,
      job: CanonicalJob,
    ) => Effect.Effect<Documents, ProfileIncomplete>;
  }
>()("@job-index/Drafting") {}
