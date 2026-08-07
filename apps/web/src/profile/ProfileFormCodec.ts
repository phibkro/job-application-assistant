import type { Profile } from "@job-index/domain/Profile";
import * as ExperienceEntry from "./ExperienceEntry.ts";
import type { ProfileForm } from "./Model.ts";
import { linesOf } from "./textList.ts";

/**
 * The only two functions that cross between `Profile` (one string per skill)
 * and `ProfileForm` (one textarea per list, newline separated) at the
 * profile level. `experience` delegates to `ExperienceEntry`'s own
 * `fromExperience`/`toExperience`, which do the same job for one entry —
 * keeping the split/join in exactly these paired places is what stops
 * "skills" or "highlights" from growing a second, slightly different
 * tokenizer inside some view helper.
 */

export const fromProfile = (profile: Profile): ProfileForm => ({
  headline: profile.headline,
  summary: profile.summary,
  location: profile.location,
  languages: profile.languages,
  skillsText: profile.skills.join("\n"),
  educationText: profile.education.join("\n"),
  experience: profile.experience.map((entry) =>
    ExperienceEntry.fromExperience(crypto.randomUUID(), entry),
  ),
});

export const toProfile = (form: ProfileForm): Profile => ({
  headline: form.headline,
  summary: form.summary,
  location: form.location,
  languages: form.languages,
  skills: linesOf(form.skillsText),
  education: linesOf(form.educationText),
  experience: form.experience.map(ExperienceEntry.toExperience),
});
