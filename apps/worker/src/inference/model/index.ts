import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { targetOf } from "@job-index/domain/Proposals";
import {
  ModelInference,
  type ModelUnavailable,
  type ProposalDraft,
} from "../../services/Inference.ts";

/** The narrow part of Cloudflare's `Ai` binding this service owns. */
export interface WorkersAi {
  readonly run: (model: string, input: unknown) => Promise<unknown>;
}

const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const MAX_MODEL_INPUT_CHARS = 120_000;

const unavailable = (reason: string): ModelUnavailable => ({ _tag: "ModelUnavailable", reason });

/**
 * Bind model inference to the deployment's native Workers AI handle. The
 * handler checks `model-inference` before this service is called; an absent or
 * failing binding is the explicit signal that activates the heuristic
 * fallback, never an unentitled model request.
 */
export const layer = (ai: WorkersAi | undefined): Layer.Layer<ModelInference> =>
  Layer.succeed(ModelInference, {
    propose: (text) => {
      if (ai === undefined) {
        return Effect.fail(
          unavailable(
            "model inference is not provisioned on this deployment; heuristic tier served instead",
          ),
        );
      }
      return Effect.tryPromise({
        try: () =>
          ai.run(MODEL, {
            prompt: promptFor(text.slice(0, MAX_MODEL_INPUT_CHARS)),
            max_tokens: 4096,
            temperature: 0,
          }),
        catch: (error) => unavailable(`Workers AI request failed: ${describe(error)}`),
      }).pipe(
        Effect.flatMap((result) =>
          Effect.try({
            try: () => decodeDrafts(result),
            catch: (error) => unavailable(`Workers AI response was invalid: ${describe(error)}`),
          }),
        ),
      );
    },
  });

const promptFor = (
  text: string,
): string => `Extract only facts explicitly supported by this CV or application letter.
Return one JSON array and no prose. Each item must be:
{"fieldPath": string, "proposedValue": JSON value, "evidenceExcerpt": string, "confidence": "high"|"medium"|"low"}.
Allowed scalar paths: headline, summary, location, languages.
Allowed array-item paths use zero-based indices: skills.N, education.N, experience.N, preferences.desiredRoles.N, preferences.desiredLocations.N, preferences.excludedTerms.N.
An experience value must be {"title":string,"employer":string,"period":string,"highlights":string[]}.
Quote short evidence that appears verbatim in the input. Do not infer unsupported preferences. Return [] when there are no supported facts.

DOCUMENT:
${text}`;

const decodeDrafts = (result: unknown): ReadonlyArray<ProposalDraft> => {
  const parsed = JSON.parse(responseText(result)) as unknown;
  if (!Array.isArray(parsed)) throw new Error("expected a JSON array");
  const nextIndexByPath = new Map<string, number>();
  const drafts = parsed.flatMap((item): ReadonlyArray<ProposalDraft> => {
    if (typeof item !== "object" || item === null) return [];
    const candidate = item as Record<string, unknown>;
    const fieldPath = candidate.fieldPath;
    const evidenceExcerpt = candidate.evidenceExcerpt;
    const confidence = candidate.confidence;
    if (
      typeof fieldPath !== "string" ||
      typeof evidenceExcerpt !== "string" ||
      (confidence !== "high" && confidence !== "medium" && confidence !== "low")
    ) {
      return [];
    }
    const target = targetOf(fieldPath);
    if (target === undefined) return [];
    const decoded = Schema.decodeUnknownOption(target)(candidate.proposedValue);
    if (decoded._tag === "None") return [];
    const normalizedPath = normalizeArrayPath(fieldPath, nextIndexByPath);
    return [
      {
        fieldPath: normalizedPath,
        proposedValue: decoded.value,
        evidenceExcerpt,
        confidence,
      },
    ];
  });
  if (parsed.length > 0 && drafts.length === 0) {
    throw new Error("response contained no valid proposals");
  }
  return drafts;
};

const normalizeArrayPath = (fieldPath: string, nextIndexByPath: Map<string, number>): string => {
  const match =
    /^(skills|education|experience|preferences\.(?:desiredRoles|desiredLocations|excludedTerms))\.\d+$/.exec(
      fieldPath,
    );
  const base = match?.[1];
  if (base === undefined) return fieldPath;
  const index = nextIndexByPath.get(base) ?? 0;
  nextIndexByPath.set(base, index + 1);
  return `${base}.${index}`;
};

const responseText = (result: unknown): string => {
  const raw =
    typeof result === "string"
      ? result
      : typeof result === "object" && result !== null && "response" in result
        ? (result as { response?: unknown }).response
        : undefined;
  if (typeof raw !== "string") throw new Error("missing text response");
  const trimmed = raw.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return fenced?.[1] ?? trimmed;
};

const describe = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
