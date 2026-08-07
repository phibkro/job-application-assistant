import type { Experience, Profile } from "@job-index/domain/Profile";

/**
 * The profile laid out as a CV, given the experience order to print it in.
 *
 * The order is a parameter rather than something this function decides,
 * because the two callers need different orders for a documented reason:
 * `composeCv` ranks against an advert, `renderAnswers` has no advert to rank
 * against and keeps the profile's own order. Sharing this renderer is what
 * keeps the layout itself — headings, punctuation, section order — a single
 * fact instead of two copies that could drift.
 */
export const renderCvBody = (profile: Profile, experience: ReadonlyArray<Experience>): string => {
  const lines: Array<string> = [];

  if (profile.headline.trim() !== "") lines.push(profile.headline.trim());
  if (profile.location.trim() !== "") lines.push(profile.location.trim());
  lines.push("");

  if (profile.summary.trim() !== "") {
    lines.push("PROFILE", profile.summary.trim(), "");
  }

  if (experience.length > 0) {
    lines.push("EXPERIENCE");
    for (const entry of experience.slice(0, 8)) {
      lines.push(`${entry.title.trim()} — ${entry.employer.trim()} (${entry.period.trim()})`);
      for (const highlight of entry.highlights.slice(0, 4)) {
        lines.push(`  · ${highlight.trim()}`);
      }
    }
    lines.push("");
  }

  if (profile.skills.length > 0) {
    lines.push("SKILLS", profile.skills.join(", "), "");
  }

  if (profile.education.length > 0) {
    lines.push("EDUCATION", ...profile.education, "");
  }

  if (profile.languages.trim() !== "") {
    lines.push("LANGUAGES", profile.languages.trim());
  }

  return lines.join("\n");
};
