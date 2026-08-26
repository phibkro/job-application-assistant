import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type { DocumentKind } from "@job-index/domain/Documents";
import type { JobSnapshot } from "@job-index/domain/Job";
import type { Profile } from "@job-index/domain/Profile";
import type { Answer } from "@job-index/domain/Answer";
import { ProfileIncomplete } from "@job-index/domain/Failure";
import { TemplateStudioComposer } from "../../services/Studio.ts";
import { composeCv } from "../composeCv.ts";
import { composeLetter } from "../composeLetter.ts";
import { renderAnswers } from "../renderAnswers.ts";

/**
 * The general covering letter: no advert exists, so there is nothing to rank
 * experience against and no overlap filter to uphold — every named fact is
 * the owner's own profile text, which is the grounding guarantee in its
 * place. Opens with headline and intent, cites the leading experience entry
 * in profile order (the same entry `composeCv` would lead a neutral document
 * with), names up to six skills, closes on location. Deterministic: the same
 * profile always yields byte-identical prose.
 */
export const composeGeneralLetter = (profile: Profile): string => {
  const opening =
    profile.headline.trim() === ""
      ? "I am writing to introduce myself and enquire about opportunities."
      : `I am ${profile.headline.trim()}, writing to introduce myself and enquire about opportunities.`;

  const bodyLines: Array<string> = [];
  if (profile.summary.trim() !== "") {
    bodyLines.push("", profile.summary.trim());
  }
  if (profile.skills.length > 0) {
    bodyLines.push("", `My work centres on ${profile.skills.slice(0, 6).join(", ")}.`);
  }
  const best = profile.experience[0];
  if (best !== undefined) {
    bodyLines.push(
      "",
      `Most recently I worked as ${best.title.trim()} at ${best.employer.trim()} (${best.period.trim()}).`,
    );
  }

  const closing =
    profile.location.trim() === ""
      ? "I am available to start by agreement."
      : `I am based for work in ${profile.location.trim()}.`;

  return [opening, ...bodyLines, "", closing, "", "Kind regards,"].join("\n");
};

/** The document body for one kind × target combination. Pure dispatch. */
export const composeDocument = (
  profile: Profile,
  answers: ReadonlyArray<Answer>,
  kind: DocumentKind,
  job: JobSnapshot | undefined,
): string => {
  if (kind === "cv") {
    return job === undefined ? renderAnswers(profile, answers) : composeCv(profile, job);
  }
  return job === undefined ? composeGeneralLetter(profile) : composeLetter(profile, job);
};

/**
 * The studio's deterministic composer (WS-0018): free, always available,
 * pure — identical inputs yield byte-identical documents.
 *
 * Dispatch is `composeDocument` above:
 *
 * - job-specific CV/letter reuse the per-listing composers verbatim, so a
 *   studio draft targeted at a saved vacancy is exactly what
 *   `POST /api/v1/me/saved/:id/draft` previews — one fact, no drift;
 * - the general CV is `renderAnswers` — profile-order layout plus stored
 *   answers under ADDITIONAL INFORMATION, wiring the orphaned renderer into
 *   production at last (WS-0015 §3(b));
 * - the general letter is `composeGeneralLetter`.
 *
 * The one gate this layer keeps from `drafting/index.ts`: neither a headline
 * nor any experience means there is nothing to draft from, whatever the kind
 * or target, so composition is refused rather than returning an empty
 * document that looks like a bug.
 */
export const layer = Layer.succeed(TemplateStudioComposer, {
  compose: (profile, answers, kind, job) =>
    profile.headline.trim() === "" && profile.experience.length === 0
      ? Effect.fail(new ProfileIncomplete({ missing: "headline or experience" }))
      : Effect.succeed({
          kind,
          content: composeDocument(profile, answers, kind, job),
          engine: "template" as const,
        }),
});
