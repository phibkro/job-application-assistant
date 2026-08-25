import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type { Confidence } from "@job-index/domain/Proposals";
import { HeuristicInference, type ProposalDraft } from "../../services/Inference.ts";

/**
 * The deterministic tier: section-and-keyword parsing over pasted CV/letter
 * text. No clock, no randomness, no model call — identical input produces
 * byte-identical proposals, which is what makes it unit-testable against a
 * fixed fixture and safe as the offline fallback for the whole feature
 * (WS-0015 §6 OQ-2).
 *
 * Bilingual EN/NO headings because the corpus this product serves is
 * Norwegian-first: EXPERIENCE and ARBEIDSERFARING are the same section here.
 * Confidence follows the evidence: a fact under an explicit heading is
 * `high`; one inferred from line structure alone is `medium`; a date-pattern
 * guess is `low`. Preferences are proposed only from explicit
 * seeking/wants-style lines — never guessed.
 */

/** A section's heading variants; all matching is on normalized upper-case. */
const SECTION_HEADINGS: ReadonlyArray<{
  readonly path: string;
  readonly names: ReadonlyArray<string>;
}> = [
  { path: "summary", names: ["SUMMARY", "SAMMENDRAG", "OM MEG", "ABOUT ME", "PROFILE"] },
  { path: "skills", names: ["SKILLS", "FERDIGHETER", "KOMPETANSE"] },
  {
    path: "experience",
    names: ["EXPERIENCE", "ARBEIDSERFARING", "WORK EXPERIENCE", "ERFARING", "EMPLOYMENT"],
  },
  { path: "education", names: ["EDUCATION", "UTDANNING"] },
  { path: "languages", names: ["LANGUAGES", "SPRÅK", "SPRAAK"] },
];

const MAX_EXCERPT = 300;

export const layer = Layer.succeed(HeuristicInference, {
  propose: (text) =>
    Effect.sync(() => {
      const lines = text.split(/\r?\n/).map((line) => line.trimEnd());
      const sections = splitSections(lines);
      const hasRecognizedStructure =
        sections.size > 0 ||
        lines.some((line) => /^(location|sted)\s*:/i.test(line.trim()) || DATE_RANGE.test(line));
      const drafts: Array<ProposalDraft> = [];

      const scalar = (path: "headline" | "summary" | "location" | "languages") => {
        if (path === "summary") {
          const body = sections.get("summary");
          if (body !== undefined && body.length > 0) {
            const paragraph = body.join(" ").replace(/\s+/g, " ").trim();
            if (paragraph.length > 0) {
              drafts.push({
                fieldPath: "summary",
                proposedValue: paragraph.slice(0, 2000),
                evidenceExcerpt: excerpt(paragraph),
                confidence: "high",
              });
            }
            return;
          }
        }
        if (path === "languages") {
          const body = sections.get("languages");
          if (body !== undefined && body.length > 0) {
            const joined = body.join(", ").replace(/\s+/g, " ").trim();
            if (joined.length > 0) {
              drafts.push({
                fieldPath: "languages",
                proposedValue: joined,
                evidenceExcerpt: excerpt(joined),
                confidence: "high",
              });
            }
          }
        }
      };
      scalar("summary");
      scalar("languages");

      // Headline: the first non-empty line before any heading — conventionally
      // the name/title block of a CV.
      const firstContent = lines.find((line) => line.trim().length > 0);
      if (
        hasRecognizedStructure &&
        firstContent !== undefined &&
        !isHeading(firstContent) &&
        firstContent.trim().length <= 80
      ) {
        drafts.push({
          fieldPath: "headline",
          proposedValue: firstContent.trim(),
          evidenceExcerpt: excerpt(firstContent),
          confidence: "medium",
        });
      }

      // Location: an explicit "Location:" / "Sted:" label anywhere in the document.
      const locationLine = lines.find((line) => /^(location|sted)\s*:/i.test(line.trim()));
      if (locationLine !== undefined) {
        const value = locationLine.split(":").slice(1).join(":").trim();
        if (value.length > 0) {
          drafts.push({
            fieldPath: "location",
            proposedValue: value,
            evidenceExcerpt: excerpt(locationLine),
            confidence: "high",
          });
        }
      }

      pushListItems(drafts, "skills", sections.get("skills"));
      pushListItems(drafts, "education", sections.get("education"));

      const experience = sections.get("experience");
      if (experience !== undefined) {
        for (const [index, entry] of splitExperience(experience).entries()) {
          const parsed = parseExperienceEntry(entry.lines);
          if (parsed !== undefined) {
            drafts.push({
              fieldPath: `experience.${index}`,
              proposedValue: parsed.value,
              evidenceExcerpt: excerpt(parsed.evidence),
              confidence: parsed.confidence,
            });
          }
        }
      }

      pushPreferences(drafts, text);

      return cap(dedupe(drafts));
    }),
});

const MAX_PROPOSALS = 64;

const normalizeHeading = (line: string): string => line.replace(/[^A-ZÅØÆ ]/g, "").trim();

const isHeading = (line: string): boolean => {
  const trimmed = line.trim();
  if (trimmed.length === 0 || trimmed.length > 60) return false;
  const upper = normalizeHeading(trimmed.toUpperCase());
  return SECTION_HEADINGS.some((section) => section.names.includes(upper));
};

/**
 * Splits the document into named sections at recognized heading lines.
 * Content above the first heading belongs to no section (the headline zone).
 */
const splitSections = (lines: ReadonlyArray<string>): Map<string, Array<string>> => {
  const sections = new Map<string, Array<string>>();
  let current: string | undefined;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const upper = normalizeHeading(line.toUpperCase());
    const match = SECTION_HEADINGS.find((section) => section.names.includes(upper));
    if (match !== undefined) {
      current = match.path;
      sections.set(current, []);
      continue;
    }
    if (current !== undefined && line.trim().length > 0) {
      sections.get(current)?.push(line.trim());
    }
    void i;
  }
  return sections;
};

const pushListItems = (
  drafts: Array<ProposalDraft>,
  field: "skills" | "education",
  body: ReadonlyArray<string> | undefined,
): void => {
  if (body === undefined) return;
  for (const [index, item] of splitListItems(body).entries()) {
    drafts.push({
      fieldPath: `${field}.${index}`,
      proposedValue: item,
      evidenceExcerpt: excerpt(item),
      confidence: "high",
    });
  }
};

const splitListItems = (body: ReadonlyArray<string>): Array<string> => {
  const items: Array<string> = [];
  for (const raw of body) {
    for (const part of raw.split(/[•·|]|,\s*/)) {
      const cleaned = part.replace(/^[-*\d.)\s]+/, "").trim();
      if (cleaned.length >= 2 && cleaned.length <= 120) {
        items.push(cleaned);
      }
    }
  }
  return items;
};

interface ExperienceBlock {
  readonly lines: ReadonlyArray<string>;
}

/**
 * Experience entries break where a new "title line directly above a date
 * range" begins — the one convention every flat-text CV shares, and the only
 * one that survives section bodies having lost their blank lines.
 */
const splitExperience = (body: ReadonlyArray<string>): ReadonlyArray<ExperienceBlock> => {
  const starts: Array<number> = [];
  body.forEach((line, index) => {
    const next = body[index + 1];
    if (next !== undefined && DATE_RANGE.test(next)) {
      starts.push(index);
    }
  });
  if (starts.length === 0) {
    return body.length > 0 ? [{ lines: body }] : [];
  }
  const blocks: Array<ExperienceBlock> = [];
  for (let b = 0; b < starts.length; b++) {
    const from = starts[b];
    const to = b + 1 < starts.length ? starts[b + 1] : body.length;
    blocks.push({ lines: body.slice(from, to) });
  }
  return blocks;
};

const DATE_RANGE =
  /(\b(19|20)\d{2}\s*[-–—]\s*((19|20)\d{2}|present|nå|i dag)|\b\d{2}\/\d{4}\s*[-–—]\s*(\d{2}\/\d{4}|present|nå))/i;

const parseExperienceEntry = (
  lines: ReadonlyArray<string>,
):
  | {
      readonly value: {
        title: string;
        employer: string;
        period: string;
        highlights: Array<string>;
      };
      readonly evidence: string;
      readonly confidence: Confidence;
    }
  | undefined => {
  if (lines.length === 0) return undefined;
  const dateLineIndex = lines.findIndex((line) => DATE_RANGE.test(line));
  if (dateLineIndex === -1) return undefined;
  const period = lines[dateLineIndex].trim().match(DATE_RANGE)?.[0] ?? lines[dateLineIndex].trim();

  // Title/employer live on the line above the dates, or on the date line
  // itself separated by a dash — both are common flat-text conventions.
  let titleLine = "";
  let employerLine = "";
  if (dateLineIndex > 0) {
    titleLine = lines[dateLineIndex - 1].trim();
  } else if (dateLineIndex === 0 && lines.length > 1) {
    titleLine = lines[1].trim();
  }
  if (dateLineIndex > 1) {
    employerLine = lines[dateLineIndex - 2].trim();
  } else if (dateLineIndex === 1) {
    employerLine = titleLine;
    titleLine = lines[0].trim();
  }
  const dashSplit = titleLine.split(/\s+[-–—]\s+/);
  const title = (dashSplit.length > 1 ? dashSplit[0] : titleLine).trim();
  const employer = dashSplit.length > 1 ? dashSplit.slice(1).join(" - ").trim() : employerLine;
  if (title.length === 0 || employer.length === 0) return undefined;

  const highlights = lines
    .filter((_, index) => index > dateLineIndex)
    .map((line) => line.replace(/^[-•*\s]+/, "").trim())
    .filter((line) => line.length > 0)
    .slice(0, 8);

  return {
    value: { title: title.slice(0, 200), employer: employer.slice(0, 200), period, highlights },
    evidence: lines.slice(0, dateLineIndex + 1).join(" · "),
    confidence: dateLineIndex === 0 ? "low" : "medium",
  };
};

const PREFERENCE_LINE = /\b(seeking|looking for|ønsker|søker|interessert i)\b[:\s]/i;

const pushPreferences = (drafts: Array<ProposalDraft>, text: string): void => {
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!PREFERENCE_LINE.test(line)) continue;
    const afterVerb = line.split(PREFERENCE_LINE)[2]?.trim() ?? "";
    const rolePart = afterVerb.replace(/^[:\-\s]+/, "").trim();
    if (rolePart.length < 2) continue;
    const kindMatch = /(role|stilling|job?b)/i.exec(line);
    const locationKind = /(location|sted|in |i )/i.exec(line);
    const fieldPath =
      locationKind !== null &&
      kindMatch !== null &&
      locationKind.index !== undefined &&
      (kindMatch.index === undefined || locationKind.index < kindMatch.index)
        ? "preferences.desiredLocations.0"
        : "preferences.desiredRoles.0";
    drafts.push({
      fieldPath,
      proposedValue: rolePart.slice(0, 120),
      evidenceExcerpt: excerpt(line),
      confidence: "medium",
    });
    return; // one preference proposal per document keeps the queue reviewable
  }
};

const excerpt = (text: string): string => {
  const collapsed = text.replace(/\s+/g, " ").trim();
  return collapsed.length <= MAX_EXCERPT ? collapsed : `${collapsed.slice(0, MAX_EXCERPT - 1)}…`;
};

const dedupe = (drafts: ReadonlyArray<ProposalDraft>): Array<ProposalDraft> => {
  const seen = new Set<string>();
  return drafts.filter((draft) => {
    const key = `${draft.fieldPath}\u0000${JSON.stringify(draft.proposedValue)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const cap = (drafts: ReadonlyArray<ProposalDraft>): ReadonlyArray<ProposalDraft> =>
  drafts.slice(0, MAX_PROPOSALS);
