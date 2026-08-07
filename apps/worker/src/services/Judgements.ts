import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { Judgement } from "@job-index/domain/Freshness";
import type { CanonicalJobId, ProfileId } from "@job-index/domain/Ids";

/**
 * What a person thought of a vacancy they were shown.
 *
 * Distinct from `Corpus.markOffered`, which is a bulk high-water mark: that
 * records what was *shown*, this records what was *thought*. Dismissing a job
 * is the feed's only feedback signal, so it is the input any future matching
 * work learns from — recording it as a sequence advance would throw the
 * verdict away and keep only the fact that something was seen.
 */
export class Judgements extends Context.Service<
  Judgements,
  {
    readonly record: (
      profile: ProfileId,
      job: CanonicalJobId,
      verdict: Judgement["verdict"],
      reason: string | undefined,
    ) => Effect.Effect<void>;
  }
>()("@job-index/Judgements") {}
