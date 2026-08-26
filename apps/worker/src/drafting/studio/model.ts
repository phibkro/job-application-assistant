import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type { DocumentKind } from "@job-index/domain/Documents";
import type { JobSnapshot } from "@job-index/domain/Job";
import type { Profile } from "@job-index/domain/Profile";
import type { Answer } from "@job-index/domain/Answer";
import {
  ModelStudioComposer,
  type ComposedDocument,
  type StudioModelUnavailable,
} from "../../services/Studio.ts";
import { renderCvBody } from "../sections.ts";

/** The narrow part of Cloudflare's `Ai` binding this service owns. */
export interface WorkersAi {
  readonly run: (model: string, input: unknown) => Promise<unknown>;
}

/**
 * The Workers AI model id. Same reviewed choice the inference engine ships
 * (`inference/model/index.ts`): `llama-3.3-70b-instruct-fp8-fast` — a
 * text-in/text-out instruct model large enough for coherent prose, in the
 * fp8-fast variant that keeps latency acceptable for an interactive drafting
 * surface. Switching models is a one-constant edit; nothing else may encode
 * the choice.
 */
const STUDIO_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

/**
 * Truncation bound before send, matching the inference engine: a profile
 * plus snapshot is far below it in practice, but the cap guarantees the
 * request can never grow unbounded with a pathological profile.
 */
const MAX_MODEL_INPUT_CHARS = 120_000;

/**
 * Upper bound on the returned document body — MAX_DOCUMENT_CHARS from the
 * Api contract (`Api.ts`), restated here as a literal so this module stays
 * import-light. A response over it cannot be a legitimate document (the
 * stored-content route rejects anything larger), so it maps to
 * `StudioModelUnavailable` and the handler degrades to the template tier
 * rather than storing text no route would accept.
 */
const MAX_MODEL_OUTPUT_CHARS = 200_000;

const unavailable = (reason: string): StudioModelUnavailable => ({
  _tag: "StudioModelUnavailable",
  reason,
});

/**
 * The model prompt, one place so its quality can be reviewed (and later
 * provisioned) as a unit. It names the grounding exhaustively — profile
 * fields, stored answers, and, when targeted, the frozen vacancy — and
 * forbids invented facts: the warranted-facts principle (`vision.md`) means
 * the model may reorganize and phrase the owner's own material, never
 * fabricate credentials or experience.
 */
const promptFor = (
  profile: Profile,
  answers: ReadonlyArray<Answer>,
  kind: DocumentKind,
  job: JobSnapshot | undefined,
): string => {
  const target =
    job === undefined
      ? "This document is GENERAL: no specific vacancy exists. Do not address any employer."
      : `This document targets this vacancy:\nTitle: ${job.title}\nEmployer: ${job.employerName}\nLocation: ${job.location}\nAdvert: ${job.description}`;
  const additional =
    answers.length === 0
      ? ""
      : `\nAdditional information to include under an "ADDITIONAL INFORMATION" heading:\n${answers
          .map((answer) => `- ${answer.label}: ${answer.value}`)
          .join("\n")}`;
  const ask =
    kind === "cv"
      ? `Write the CV as plain text using these section headings where content exists: PROFILE, EXPERIENCE, SKILLS, EDUCATION, LANGUAGES${answers.length > 0 ? ", ADDITIONAL INFORMATION" : ""}.`
      : 'Write a covering letter of at most five short paragraphs, ending with "Kind regards,".';
  return `You are drafting ONE ${kind === "cv" ? "CV" : "covering letter"} for a job applicant.
Use ONLY the facts below. Never invent employers, dates, skills, or claims; if a section has no supporting facts, omit that section.
${ask}
${target}
${additional}

PROFILE:
${renderCvBody(profile, profile.experience)}

Return only the document text.`;
};

/**
 * Bind the studio's model engine to the deployment's native Workers AI
 * handle. The handler checks `model-drafting` before this service is called;
 * an absent binding, a failed request, or unusable output is the explicit
 * `StudioModelUnavailable` signal the handler degrades on — template output
 * plus a downgrade reason, never a 5xx for a premium feature.
 *
 * `env.AI` is UNPROVISIONED this slice (operator prompt review precedes
 * provisioning), so production always takes the absent-binding path here and
 * every test exercises this module through fakes — no real model endpoint is
 * ever contacted by the suite.
 */
export const layer = (ai: WorkersAi | undefined): Layer.Layer<ModelStudioComposer> =>
  Layer.succeed(ModelStudioComposer, {
    compose: (
      profile,
      answers,
      kind,
      job,
    ): Effect.Effect<ComposedDocument, StudioModelUnavailable> => {
      if (ai === undefined) {
        return Effect.fail(
          unavailable(
            "the model engine is not provisioned on this deployment; the template composer served instead",
          ),
        );
      }
      return Effect.tryPromise({
        try: () =>
          ai.run(STUDIO_MODEL, {
            prompt: promptFor(profile, answers, kind, job).slice(0, MAX_MODEL_INPUT_CHARS),
            max_tokens: 4096,
            temperature: 0,
          }),
        catch: (error) => unavailable(`Workers AI request failed: ${describe(error)}`),
      }).pipe(
        Effect.flatMap((result) =>
          Effect.try({
            try: () => responseText(result),
            catch: (error) => unavailable(`Workers AI response was invalid: ${describe(error)}`),
          }),
        ),
        Effect.map((content): ComposedDocument => ({ kind, content, engine: "model" as const })),
        // An oversized response is not a document this system can store —
        // degrade to the template tier rather than persisting it.
        Effect.filterOrFail(
          (composed) => composed.content.length <= MAX_MODEL_OUTPUT_CHARS,
          () =>
            unavailable(
              `Workers AI response exceeded the ${MAX_MODEL_OUTPUT_CHARS}-character document bound; the template composer served instead`,
            ),
        ),
      );
    },
  });

const responseText = (result: unknown): string => {
  const raw =
    typeof result === "string"
      ? result
      : typeof result === "object" && result !== null && "response" in result
        ? (result as { response?: unknown }).response
        : undefined;
  if (typeof raw !== "string") throw new Error("missing text response");
  return raw;
};

const describe = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** Test doubles mirroring `inference/model/test.ts`: no real model request anywhere. */

/** A fake whose engine cannot run — drives the degrade-to-template path. */
export const makeModelUnavailable = (reason: string) =>
  Layer.succeed(ModelStudioComposer, {
    compose: (): Effect.Effect<ComposedDocument, StudioModelUnavailable> =>
      Effect.fail({ _tag: "StudioModelUnavailable", reason }),
  });

/** A fake whose engine succeeds with fixed prose — drives the entitled happy path. */
export const makeProposingModel = (content: string) =>
  Layer.succeed(ModelStudioComposer, {
    compose: (
      _profile: Profile,
      _answers: ReadonlyArray<Answer>,
      kind: DocumentKind,
    ): Effect.Effect<ComposedDocument, StudioModelUnavailable> =>
      Effect.succeed({ kind, content, engine: "model" }),
  });
