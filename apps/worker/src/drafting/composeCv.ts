import type { CanonicalJob } from "@job-index/domain/Job";
import type { Profile } from "@job-index/domain/Profile";
import { advertText, rankExperience } from "./relevance.ts";
import { renderCvBody } from "./sections.ts";

/**
 * The CV for one advert: the profile's experience reordered so the entry
 * most relevant to this vacancy leads, everything else unchanged. Pure, so
 * the same profile and advert always compose the same document — which is
 * what makes the output reviewable rather than merely trusted.
 */
export const composeCv = (profile: Profile, job: CanonicalJob): string =>
  renderCvBody(profile, rankExperience(profile.experience, advertText(job)));
