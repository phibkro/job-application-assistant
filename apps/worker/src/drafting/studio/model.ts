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
import { finalize, keyFacts, type FinalizeResult, type KeyedFact } from "./keys.ts";

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

/** Hard bound applied while adding whole inventory lines, never by slicing. */
export const MAX_MODEL_INPUT_CHARS = 120_000;

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
 * The keyed prompt (WS-0019 D2). The model's entire view of the applicant is
 * the placeholder inventory: it may reorganize and phrase fact REFERENCES,
 * never see or echo the facts themselves. Substitution happens locally in
 * `finalize`, after the model session has terminated.
 */
interface Grounding {
  readonly prompt: string;
  readonly facts: ReadonlyArray<KeyedFact>;
  readonly finalize: (modelText: string) => FinalizeResult;
}

export const promptFor = (
  profile: Profile,
  answers: ReadonlyArray<Answer>,
  kind: DocumentKind,
  job: JobSnapshot | undefined,
): Grounding | undefined => {
  const allFacts = keyFacts(profile, answers, job);
  // Target keys are referenced by the fixed instruction, so they must be
  // admitted before optional profile/answer keys.
  const candidates =
    job === undefined
      ? allFacts
      : [
          ...allFacts.filter((fact) => fact.key.startsWith("job.")),
          ...allFacts.filter((fact) => !fact.key.startsWith("job.")),
        ];
  const hasAnswers = allFacts.some((fact) => fact.key.startsWith("answer."));
  const target =
    job === undefined
      ? "This document is GENERAL: no specific vacancy exists. Do not address any employer."
      : "This document targets the vacancy {{job.title}} at {{job.employerName}}, located {{job.location}}. The full advert text is available as {{job.description}}.";
  const additionalNote = hasAnswers
    ? 'Facts under answer.* belong under an "ADDITIONAL INFORMATION" heading.'
    : "";
  const ask =
    kind === "cv"
      ? `Write the CV as plain text using these section headings where content exists: PROFILE, EXPERIENCE, SKILLS, EDUCATION, LANGUAGES${hasAnswers ? ", ADDITIONAL INFORMATION" : ""}.`
      : 'Write a covering letter of at most five short paragraphs, ending with "Kind regards,".';
  const prefix = `You are drafting ONE ${kind === "cv" ? "CV" : "covering letter"} for a job applicant.
Use ONLY the fact keys listed below. Never invent employers, dates, skills, or claims; if a section has no supporting keys, omit that section.
CRITICAL: every fact appears ONLY as a double-brace placeholder such as {{profile.headline}}.
Copy placeholders VERBATIM into your text wherever that fact belongs. NEVER write out what a placeholder stands for — you do not know the values, and you must not guess them. Placeholders are replaced with the real values locally after you finish; anything you invent instead would be wrong.
Never output double braces for any other purpose.
${ask}
${target}
${additionalNote}

FACT KEYS:
`;
  const suffix = "\n\nReturn only the document text.";
  if (prefix.length + suffix.length > MAX_MODEL_INPUT_CHARS) return undefined;

  const sent: Array<KeyedFact> = [];
  const lines: Array<string> = [];
  for (const fact of candidates) {
    const line = `{{${fact.key}}}`;
    const inventory = lines.length === 0 ? line : `${lines.join("\n")}\n${line}`;
    if (prefix.length + inventory.length + suffix.length > MAX_MODEL_INPUT_CHARS) break;
    sent.push(fact);
    lines.push(line);
  }
  if (
    job !== undefined &&
    ["job.title", "job.employerName", "job.location", "job.description"].some(
      (key) => !sent.some((fact) => fact.key === key),
    )
  ) {
    return undefined;
  }
  const prompt = `${prefix}${lines.join("\n")}${suffix}`;
  return { prompt, facts: sent, finalize: (modelText) => finalize(modelText, sent) };
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
      const grounding = promptFor(profile, answers, kind, job);
      if (grounding === undefined) {
        return Effect.fail(
          unavailable(
            "the keyed prompt could not fit safely within the model input bound; the template composer served instead",
          ),
        );
      }
      return Effect.tryPromise({
        try: () =>
          ai.run(STUDIO_MODEL, {
            prompt: grounding.prompt,
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
        Effect.map((modelText) => grounding.finalize(modelText)),
        // Substitution happened inside `finalize`, after the model session
        // terminated and before anything reaches storage. A model that echoed
        // raw values or invented tokens is a misbehaving engine like any
        // other: every case below degrades to the template tier.
        Effect.flatMap((finalized) => {
          if (finalized._tag === "RawValueLeak") {
            return Effect.fail(
              unavailable(
                `the model echoed raw values for ${finalized.keys.length} fact(s); the template composer served instead`,
              ),
            );
          }
          if (finalized._tag === "UnresolvedPlaceholder") {
            return Effect.fail(
              unavailable(
                "the model returned placeholders outside the fact inventory; the template composer served instead",
              ),
            );
          }
          if (finalized.content.length > MAX_MODEL_OUTPUT_CHARS) {
            return Effect.fail(
              unavailable(
                `Workers AI response exceeded the ${MAX_MODEL_OUTPUT_CHARS}-character document bound; the template composer served instead`,
              ),
            );
          }
          return Effect.succeed<ComposedDocument>({
            kind,
            content: finalized.content,
            engine: "model" as const,
          });
        }),
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
