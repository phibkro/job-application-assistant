import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { Confidence } from "@job-index/domain/Proposals";

/**
 * Proposing structured profile facts from pasted document text.
 *
 * A `Drafting`-style split (see `services/Drafting.ts`): two implementations
 * answer the same question at different cost tiers. The deterministic one is
 * free and always available; the model tier costs an inference call and is
 * therefore behind the `model-inference` capability — but entitlement is
 * checked by the *handler*, before this service is reached, exactly as the
 * model-drafting gate sits in its handler (`handlers/applications.ts`). The
 * tags themselves do not know what the caller has paid for.
 *
 * Engines receive extracted text, never raw bytes or PDFs: extraction is a
 * separate seam (`services/Extraction.ts`) so the parser choice composes
 * independently of the inference choice.
 */
export interface ProposalDraft {
  /** One of the closed field-path grammar strings in `domain/Proposals.ts`. */
  readonly fieldPath: string;
  /** Validated against `targetOf(fieldPath)` before anything persists. */
  readonly proposedValue: unknown;
  /** The quote from the text this came from — the proposal's warrant. */
  readonly evidenceExcerpt: string;
  readonly confidence: Confidence;
}

/** Fails when the model tier cannot run; the handler downgrades to heuristics. */
export interface ModelUnavailable {
  readonly _tag: "ModelUnavailable";
  readonly reason: string;
}

export class HeuristicInference extends Context.Service<
  HeuristicInference,
  {
    readonly propose: (text: string) => Effect.Effect<ReadonlyArray<ProposalDraft>>;
  }
>()("@job-index/HeuristicInference") {}

export class ModelInference extends Context.Service<
  ModelInference,
  {
    readonly propose: (
      text: string,
    ) => Effect.Effect<ReadonlyArray<ProposalDraft>, ModelUnavailable>;
  }
>()("@job-index/ModelInference") {}
