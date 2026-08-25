import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import {
  ModelInference,
  type ModelUnavailable,
  type ProposalDraft,
} from "../../services/Inference.ts";

/**
 * Explicit model-layer fakes for handler tests. Production binds the native
 * `env.AI` handle through `inference/model/index.ts`; these constructors keep
 * unit tests deterministic and prove both the success and fallback contracts
 * without issuing model requests.
 */
export const makeUnavailable = (reason: string) =>
  Layer.succeed(ModelInference, {
    propose: (): Effect.Effect<ReadonlyArray<ProposalDraft>, ModelUnavailable> =>
      Effect.fail({ _tag: "ModelUnavailable", reason }),
  });

/** A fake that always proposes — for tests of the entitled happy path. */
export const makeProposing = (drafts: ReadonlyArray<ProposalDraft>) =>
  Layer.succeed(ModelInference, {
    propose: () => Effect.succeed(drafts),
  });
