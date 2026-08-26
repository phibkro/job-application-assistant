import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { DocumentKind, CompositionEngine } from "@job-index/domain/Documents";
import type { JobSnapshot } from "@job-index/domain/Job";
import type { Profile } from "@job-index/domain/Profile";
import type { ProfileIncomplete } from "@job-index/domain/Failure";
import type { Answer } from "@job-index/domain/Answer";

/**
 * The studio's two composition engines (WS-0015 §4 S2 / WS-0018).
 *
 * A `Drafting`-style split (see `services/Drafting.ts` and the WS-0016
 * `services/Inference.ts` realization): two implementations answer the same
 * question at different cost tiers, and a subscription buys better prose,
 * not a different product. The tags do not know what the caller has paid
 * for — entitlement is checked by the handler before either service is
 * reached (`handlers/documents.ts`), exactly as the model-drafting gate sits
 * in its handler and the model-inference gate sits in proposals'.
 *
 * Both engines take stored answers alongside the profile: general documents
 * project them into an additional-information section (wiring up the
 * orphaned `renderAnswers`, WS-0015 §3(b)); job-specific documents compose
 * from the frozen snapshot exactly like the apply loop's preview and
 * deliberately exclude them so a studio draft can never disagree with what
 * `prepare` composes from the same inputs.
 *
 * The model tier is exercised through test doubles only this slice:
 * `env.AI` stays unprovisioned until operator prompt review, and absence of
 * the binding is the explicit signal that fails with `StudioModelUnavailable`
 * for the handler to degrade on.
 */

/** Fails when the model tier cannot run; the handler downgrades to template. */
export interface StudioModelUnavailable {
  readonly _tag: "StudioModelUnavailable";
  readonly reason: string;
}

export interface ComposedDocument {
  readonly kind: DocumentKind;
  /** The document body as plain text/markdown. */
  readonly content: string;
  readonly engine: CompositionEngine;
}

export class TemplateStudioComposer extends Context.Service<
  TemplateStudioComposer,
  {
    readonly compose: (
      profile: Profile,
      answers: ReadonlyArray<Answer>,
      kind: DocumentKind,
      job: JobSnapshot | undefined,
    ) => Effect.Effect<ComposedDocument, ProfileIncomplete>;
  }
>()("@job-index/TemplateStudioComposer") {}

export class ModelStudioComposer extends Context.Service<
  ModelStudioComposer,
  {
    readonly compose: (
      profile: Profile,
      answers: ReadonlyArray<Answer>,
      kind: DocumentKind,
      job: JobSnapshot | undefined,
    ) => Effect.Effect<ComposedDocument, StudioModelUnavailable>;
  }
>()("@job-index/ModelStudioComposer") {}
