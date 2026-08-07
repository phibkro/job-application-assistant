import type { JobSnapshot } from "@job-index/domain/Job";
import type { Profile } from "@job-index/domain/Profile";
import { advertText, rankExperience } from "./relevance.ts";

/**
 * The skills a letter is permitted to name: exactly the profile's skills
 * that occur, verbatim and case-insensitively, in the advert's own text.
 *
 * This is the whole guarantee. `composeLetter` has no second path that
 * prints `profile.skills` — every skill the letter ever names comes through
 * here, so a skill the advert never mentions structurally cannot appear.
 */
const matchedSkills = (skills: ReadonlyArray<string>, advert: string): ReadonlyArray<string> => {
  const haystack = advert.toLowerCase();
  return skills.filter((skill) => haystack.includes(skill.toLowerCase())).slice(0, 6);
};

/**
 * The covering letter for one advert.
 *
 * Opens with the role and the employer, cites the experience most relevant
 * to this vacancy, and names overlap only where `matchedSkills` finds it —
 * see there for the guarantee this function exists to uphold.
 */
export const composeLetter = (profile: Profile, job: JobSnapshot): string => {
  const advert = advertText(job);
  const best = rankExperience(profile.experience, advert)[0];

  const opening =
    profile.headline.trim() === ""
      ? `I am applying for ${job.title} at ${job.employerName}.`
      : `I am applying for ${job.title} at ${job.employerName}. I am ${profile.headline.trim()}.`;

  const bodyLines: Array<string> = [];
  if (best !== undefined) {
    const highlight = best.highlights[0];
    const opener = `Most recently I worked as ${best.title.trim()} at ${best.employer.trim()} (${best.period.trim()}).`;
    bodyLines.push(highlight === undefined ? opener : `${opener} ${highlight.trim()}`);
  }

  const matched = matchedSkills(profile.skills, advert);
  if (matched.length > 0) {
    bodyLines.push(
      "",
      `The advert asks for ${matched.join(", ")}, which is what I have been doing.`,
    );
  }

  const closing =
    job.location.trim() === ""
      ? "I am available to start by agreement."
      : `I am based for work in ${job.location.trim()}.`;

  return [opening, "", ...bodyLines, "", closing, "", "Kind regards,"].join("\n");
};
