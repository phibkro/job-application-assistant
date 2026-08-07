import type { JobSnapshot } from "@job-index/domain/Job";
import type { Experience } from "@job-index/domain/Profile";

/**
 * The advert's searchable text, so every scorer reads the exact same
 * haystack rather than each recomputing its own idea of "the advert".
 */
export const advertText = (job: JobSnapshot): string =>
  `${job.title} ${job.description} ${job.employerName}`;

/**
 * How strongly one piece of experience matches an advert.
 *
 * A token counts only past a length of three and only once the advert's own
 * punctuation and casing are stripped, so "a" or "the" cannot inflate a score
 * and "TypeScript." matches the same as "typescript".
 *
 * Deterministic and total: the same experience and advert always score the
 * same, which is what lets a ranking be reviewed rather than merely trusted.
 *
 * ```ts import.meta.vitest
 * const advert = "Support Engineer needed for chat and telephone support."
 * const support = {
 *   title: "Customer Service Adviser",
 *   employer: "Nordic Retail AS",
 *   period: "2022-2026",
 *   highlights: ["Handled chat and telephone support"],
 * }
 * const barista = {
 *   title: "Barista",
 *   employer: "Kaffebrenneriet",
 *   period: "2019-2022",
 *   highlights: ["Trained new staff"],
 * }
 *
 * relevance(support, advert) > relevance(barista, advert) // => true
 * ```
 */
export const relevance = (entry: Experience, advert: string): number => {
  const haystack = advert.toLowerCase();
  const tokens = [entry.title, ...entry.highlights].flatMap((line) => line.split(/\s+/));
  let score = 0;
  for (const raw of tokens) {
    const token = raw.replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, "").toLowerCase();
    if (token.length > 3 && haystack.includes(token)) {
      score += 1;
    }
  }
  return score;
};

/**
 * Experience ordered so the strongest match to the advert leads.
 *
 * Ties keep the profile's own order rather than whatever the sort happens to
 * do with equal keys: a person's most recent role should not reorder itself
 * against an equally-scored older one from one draft to the next.
 */
export const rankExperience = (
  experience: ReadonlyArray<Experience>,
  advert: string,
): ReadonlyArray<Experience> =>
  experience
    .map((entry, index) => ({ entry, index, score: relevance(entry, advert) }))
    .toSorted((a, b) => b.score - a.score || a.index - b.index)
    .map(({ entry }) => entry);

if (import.meta.vitest) {
  const { it, expect } = import.meta.vitest;

  it("ranks matching experience above unrelated experience", () => {
    const advert = "Support Engineer needed for chat and telephone support.";
    const support: Experience = {
      title: "Customer Service Adviser",
      employer: "Nordic Retail AS",
      period: "2022-2026",
      highlights: ["Handled chat and telephone support"],
    };
    const barista: Experience = {
      title: "Barista",
      employer: "Kaffebrenneriet",
      period: "2019-2022",
      highlights: ["Trained new staff"],
    };
    expect(relevance(support, advert)).toBeGreaterThan(relevance(barista, advert));
  });
}
