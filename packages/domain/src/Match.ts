import * as Schema from "effect/Schema";
import { CanonicalJob } from "./Job.ts";
import { preferencesOf, type Profile } from "./Profile.ts";

/** A concrete fact that explains one point (or group of points) of fit. */
export const MatchEvidence = Schema.Struct({
  kind: Schema.Literals(["role", "location", "skill"]),
  profileValue: Schema.String,
  jobField: Schema.Literals(["title", "description", "employerName", "location"]),
  jobValue: Schema.String,
});
export type MatchEvidence = typeof MatchEvidence.Type;

export const MatchFit = Schema.Literals(["strong", "possible", "weak"]);
export type MatchFit = typeof MatchFit.Type;

/** The explainable, deterministic result of comparing one profile to one job. */
export const MatchAssessment = Schema.Struct({
  fit: MatchFit,
  score: Schema.Int,
  reasons: Schema.Array(MatchEvidence),
  concerns: Schema.Array(Schema.String),
});
export type MatchAssessment = typeof MatchAssessment.Type;

export const MatchedJob = Schema.Struct({
  job: CanonicalJob,
  assessment: MatchAssessment,
});
export type MatchedJob = typeof MatchedJob.Type;

/** Match text without case, Norwegian letter, combining-mark, or whitespace differences. */
export const foldMatchText = (value: string): string =>
  value
    .replaceAll("ø", "o")
    .replaceAll("Ø", "O")
    .replaceAll("æ", "ae")
    .replaceAll("Æ", "Ae")
    .normalize("NFD")
    .replace(/\p{M}|\s/gu, "")
    .toLowerCase();

const includesFolded = (haystack: string, needle: string): boolean =>
  needle !== "" && foldMatchText(haystack).includes(foldMatchText(needle));

const jobFields = (
  job: CanonicalJob,
): ReadonlyArray<readonly [MatchEvidence["jobField"], string]> => {
  const fields: Array<readonly [MatchEvidence["jobField"], string]> = [
    ["title", job.title],
    ["employerName", job.employerName],
    ["location", job.location],
  ];
  if (job.hydration._tag === "Hydrated") fields.push(["description", job.hydration.description]);
  return fields;
};

/** True when an excluded term occurs in any user-visible corpus field. */
export const isExcluded = (profile: Profile, job: CanonicalJob): boolean => {
  const fields = jobFields(job);
  return preferencesOf(profile).excludedTerms.some((term) =>
    fields.some(([, value]) => includesFolded(value, term)),
  );
};

/**
 * Pure profile-to-job assessment. Scores are deliberately small and fixed:
 * one role match is worth 3, one location match 2, and each unique skill match
 * is worth 1 up to three skills. Excluded jobs are not assessable.
 */
export const assess = (profile: Profile, job: CanonicalJob): MatchAssessment | undefined => {
  if (job.status._tag !== "Active" || isExcluded(profile, job)) return undefined;

  const preferences = preferencesOf(profile);
  const reasons: Array<MatchEvidence> = [];
  let score = 0;

  const role = preferences.desiredRoles.find((value) => includesFolded(job.title, value));
  if (role !== undefined && role.trim() !== "") {
    reasons.push({ kind: "role", profileValue: role, jobField: "title", jobValue: job.title });
    score += 3;
  }

  const location = preferences.desiredLocations.find((value) =>
    includesFolded(job.location, value),
  );
  if (location !== undefined && location.trim() !== "") {
    reasons.push({
      kind: "location",
      profileValue: location,
      jobField: "location",
      jobValue: job.location,
    });
    score += 2;
  }

  const fields = jobFields(job);
  const seenSkills = new Set<string>();
  for (const skill of profile.skills) {
    const foldedSkill = foldMatchText(skill.trim());
    if (
      foldedSkill === "" ||
      seenSkills.has(foldedSkill) ||
      reasons.filter((reason) => reason.kind === "skill").length >= 3
    ) {
      continue;
    }
    const found = fields.find(([, value]) => includesFolded(value, skill));
    if (found === undefined) continue;
    seenSkills.add(foldedSkill);
    reasons.push({ kind: "skill", profileValue: skill, jobField: found[0], jobValue: found[1] });
    score += 1;
  }

  const concerns: Array<string> = [];
  if (preferences.desiredRoles.length > 0 && role === undefined) {
    concerns.push("No desired role matched the job title");
  }
  if (preferences.desiredLocations.length > 0 && location === undefined) {
    concerns.push("No desired location matched the job location");
  }

  return {
    fit: score >= 6 ? "strong" : score >= 3 ? "possible" : "weak",
    score,
    reasons,
    concerns,
  };
};

export const matchedJob = (profile: Profile, job: CanonicalJob): MatchedJob | undefined => {
  const assessment = assess(profile, job);
  return assessment === undefined ? undefined : { job, assessment };
};

/** Stable rank: score descending, then corpus sequence descending, then id ascending. */
export const rankMatchedJobs = (items: ReadonlyArray<MatchedJob>): ReadonlyArray<MatchedJob> =>
  items.toSorted(
    (left, right) =>
      right.assessment.score - left.assessment.score ||
      Number(right.job.sequence) - Number(left.job.sequence) ||
      left.job.id.localeCompare(right.job.id),
  );
