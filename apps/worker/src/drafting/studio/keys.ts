import type { Answer } from "@job-index/domain/Answer";
import type { JobSnapshot } from "@job-index/domain/Job";
import type { Profile } from "@job-index/domain/Profile";
import { preferencesOf } from "@job-index/domain/Profile";

/**
 * The key-based deidentifier (WS-0019 D2).
 *
 * The model never receives a profile value. It receives an inventory of
 * stable keys — `{{profile.headline}}`, `{{profile.skills.0}}`,
 * `{{answer.notice-period}}`, `{{job.title}}` — and returns text containing
 * those placeholders; substitution with the real values happens locally,
 * after the model session terminates. The prompt therefore carries structure
 * (how many facts exist, how long they roughly are), never contents.
 *
 * Everything here is pure: same inputs, same inventory, same substitution.
 */

/** One keyed fact: its stable reference and the local-only value behind it. */
export interface KeyedFact {
  readonly key: string;
  readonly value: string;
}

const isUnsafeQuestionKey = (question: string): boolean =>
  question.length === 0 || !/^[A-Za-z0-9_-]+$/.test(question);

/**
 * The full inventory for one compose request. Keys whose values are empty
 * are omitted (the model cannot reference what does not exist), and answers
 * whose question key fails the grammar are excluded entirely — their values
 * never travel to the model, deterministically and by construction.
 */
export const keyFacts = (
  profile: Profile,
  answers: ReadonlyArray<Answer>,
  job: JobSnapshot | undefined,
): ReadonlyArray<KeyedFact> => {
  const facts: Array<KeyedFact> = [];
  const push = (key: string, value: string): void => {
    if (value.trim() !== "") facts.push({ key, value });
  };

  push("profile.headline", profile.headline);
  push("profile.summary", profile.summary);
  push("profile.location", profile.location);
  push("profile.languages", profile.languages);
  profile.skills.forEach((value, i) => push(`profile.skills.${i}`, value));
  profile.education.forEach((value, i) => push(`profile.education.${i}`, value));
  const preferences = preferencesOf(profile);
  preferences.desiredRoles.forEach((value, i) =>
    push(`profile.preferences.desiredRoles.${i}`, value),
  );
  preferences.desiredLocations.forEach((value, i) =>
    push(`profile.preferences.desiredLocations.${i}`, value),
  );
  preferences.excludedTerms.forEach((value, i) =>
    push(`profile.preferences.excludedTerms.${i}`, value),
  );
  profile.experience.forEach((entry, i) => {
    push(`profile.experience.${i}.title`, entry.title);
    push(`profile.experience.${i}.employer`, entry.employer);
    push(`profile.experience.${i}.period`, entry.period);
    entry.highlights.forEach((highlight, j) =>
      push(`profile.experience.${i}.highlights.${j}`, highlight),
    );
  });

  for (const answer of answers) {
    if (isUnsafeQuestionKey(answer.question)) continue;
    push(`answer.${answer.question}`, answer.value);
  }

  if (job !== undefined) {
    push("job.title", job.title);
    push("job.employerName", job.employerName);
    push("job.location", job.location);
    push("job.description", job.description);
  }

  return facts;
};

/** One `{{key}}` per line — the model's entire view of the applicant's facts. */
export const renderInventory = (facts: ReadonlyArray<KeyedFact>): string =>
  facts.map((fact) => `{{${fact.key}}}`).join("\n");

/** Any residual double-open-brace after substitution means the model invented a token. */
const RESIDUAL = /\{\{/;

/**
 * The result of finalizing model output against the key map.
 *
 * - `Finalized` — every known token was substituted and no raw value
 *   appeared in the model's own words; content is ready to store.
 * - `RawValueLeak` — the model wrote out at least one real value verbatim
 *   instead of using placeholders; named so the downgrade reason can be
 *   specific without echoing the leaked material into storage.
 * - `UnresolvedPlaceholder` — a token survived that no known key explains;
 *   storing it would put literal braces into a person's document.
 */
export type FinalizeResult =
  | { readonly _tag: "Finalized"; readonly content: string }
  | { readonly _tag: "RawValueLeak"; readonly keys: ReadonlyArray<string> }
  | { readonly _tag: "UnresolvedPlaceholder" };

/** Values shorter than this are exempt from the leak scan: too collision-prone to scan meaningfully. */
const MIN_SCANNABLE_VALUE_LENGTH = 4;

const WELL_FORMED_SPAN = /\{\{([A-Za-z0-9_.-]*)\}\}/g;

/** The exact grammar a span's interior must satisfy to be a token at all. */
const TOKEN_INTERIOR = /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/;

/**
 * Finalize model text: leak-scan, structural check, substitute. All checks
 * run against the model's own words BEFORE any substitution — once a real
 * value lands in the output it is never re-scanned, so a value that itself
 * contains braces passes through inertly instead of failing the document.
 */
export const finalize = (modelText: string, facts: ReadonlyArray<KeyedFact>): FinalizeResult => {
  const leaked = facts
    .filter(
      (fact) => fact.value.length >= MIN_SCANNABLE_VALUE_LENGTH && modelText.includes(fact.value),
    )
    .map((fact) => fact.key);
  if (leaked.length > 0) return { _tag: "RawValueLeak", keys: leaked };

  // Structural check: every double-brace span in the model's words must be a
  // grammatical token naming a known key. Anything else — invented keys,
  // unpaired braces, brace soup — is rejected rather than stored.
  let unresolved = false;
  const withoutSpans = modelText.replace(WELL_FORMED_SPAN, "");
  if (RESIDUAL.test(withoutSpans)) return { _tag: "UnresolvedPlaceholder" };

  const byKey = new Map(facts.map((fact) => [fact.key, fact.value]));
  const content = modelText.replace(WELL_FORMED_SPAN, (_match, interior: string) => {
    if (!TOKEN_INTERIOR.test(interior)) {
      unresolved = true;
      return "";
    }
    const value = byKey.get(interior);
    if (value === undefined) {
      unresolved = true;
      return "";
    }
    return value;
  });
  if (unresolved) return { _tag: "UnresolvedPlaceholder" };
  return { _tag: "Finalized", content };
};
