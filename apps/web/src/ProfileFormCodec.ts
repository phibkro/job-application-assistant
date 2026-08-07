import type { Profile } from "@job-index/domain/Profile";
import type { ExperienceForm, ProfileForm } from "./Model.ts";

/**
 * The only two functions that cross between `Profile` (one string per skill,
 * one struct per job) and `ProfileForm` (one textarea per list, newline
 * separated). Keeping the split/join in exactly these two places is what
 * stops "skills" from growing a second, slightly different tokenizer inside
 * some view helper.
 */

const linesOf = (text: string): ReadonlyArray<string> =>
  text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

export const fromProfile = (profile: Profile): ProfileForm => ({
  headline: profile.headline,
  summary: profile.summary,
  location: profile.location,
  languages: profile.languages,
  skillsText: profile.skills.join("\n"),
  educationText: profile.education.join("\n"),
  experience: profile.experience.map((entry) => ({
    title: entry.title,
    employer: entry.employer,
    period: entry.period,
    highlightsText: entry.highlights.join("\n"),
  })),
});

export const toProfile = (form: ProfileForm): Profile => ({
  headline: form.headline,
  summary: form.summary,
  location: form.location,
  languages: form.languages,
  skills: linesOf(form.skillsText),
  education: linesOf(form.educationText),
  experience: form.experience.map((entry) => ({
    title: entry.title,
    employer: entry.employer,
    period: entry.period,
    highlights: linesOf(entry.highlightsText),
  })),
});

export const emptyExperience: ExperienceForm = {
  title: "",
  employer: "",
  period: "",
  highlightsText: "",
};
