import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { JobSnapshot } from "@job-index/domain/Job";
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
 *
 * Takes a `JobSnapshot`, not a live `CanonicalJob`: every field this and its
 * composers read (title, employer, location, description) is exactly what a
 * snapshot carries, and drafting from the frozen advert a person actually
 * saved — rather than whatever the corpus says right now — is what makes a
 * re-drafted CV describe the vacancy the person applied to, not one that has
 * since been edited or pruned. A live `CanonicalJob` still satisfies this
 * structurally; nothing here needed its extra fields.
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
      job: JobSnapshot,
    ) => Effect.Effect<Documents, ProfileIncomplete>;
  }
>()("@job-index/Drafting") {}
