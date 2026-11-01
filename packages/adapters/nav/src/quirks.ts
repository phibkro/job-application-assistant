/**
 * NAV source quirks, as data (WS-0022 §9; lead handoff "Verification": a catalogue in the pg-txmode style). Thin on
 * purpose (L1): only facts already verified in WS-0020/WS-0024 evidence or in this repository's fixtures, plus the
 * provisional hydration default L4 requires to be labelled here.
 *
 * `verifiedBy`: `fixture` means a checked-in fixture shows it and `quirks.test.ts` re-checks it; `docs` means a
 * source's own documentation says it; `unverified` means nobody has checked it against NAV yet.
 */
export interface SourceQuirk {
  readonly id: string;
  readonly fact: string;
  readonly consequence: string;
  readonly verifiedBy: "docs" | "fixture" | "unverified";
  /** The fixture (under `fixtures/nav/`) or the evidence document that shows it. */
  readonly evidence: string;
  /** Marks a value that is a placeholder until measured (L4). */
  readonly provisional?: true;
}

export const NAV_QUIRKS: ReadonlyArray<SourceQuirk> = [
  {
    id: "NAV-Q1",
    fact: "A feed entry carries no extent, orgnr, positioncount, published date or expiry; only the detail does.",
    consequence:
      "Feed-only observations carry those attributes as TempUnknown, and workload stays TempUnknown until a detail is observed (bounded hydration).",
    verifiedBy: "fixture",
    evidence: "feed-page.json; WS-0020 G11",
  },
  {
    id: "NAV-Q2",
    fact: "The detail's `extent` is a category (`Heltid`/`Deltid`), not a percentage.",
    consequence:
      "`Deltid` with no percentage in the text is Unsupported, never an FTE; `Heltid` maps to [1, 1] by declared category mapping.",
    verifiedBy: "fixture",
    evidence: "live-detail.json (`extent: Deltid`); WS-0024 finding 4",
  },
  {
    id: "NAV-Q3",
    fact: "Whether NAV exposes a workload percentage field anywhere in the feed API.",
    consequence:
      "Assumed absent: percentages are only read from description text (workload@1). The feed-spec check was blocked by network policy in WS-0022.",
    verifiedBy: "unverified",
    evidence: "evidence/WS-0022/README.md, NAV feed-spec check",
  },
  {
    id: "NAV-Q4",
    fact: '`positioncount` arrives as a string (`"3"`).',
    consequence:
      "Decoded to an integer `totalJobOpenings`; a non-integer is Unknown with the raw value as evidence.",
    verifiedBy: "fixture",
    evidence: "live-detail.json; WS-0020 G5",
  },
  {
    id: "NAV-Q5",
    fact: "The detail endpoint for an advert that has closed returns `{uuid, sistEndret, status}` with no `ad_content`.",
    consequence: "Observed as a StatusOnly observation (status INACTIVE), not a decode failure.",
    verifiedBy: "fixture",
    evidence:
      "packages/adapters/nav/src/index.test.ts (ClosedSince payload); decode.ts isClosedSince",
  },
  {
    id: "NAV-Q6",
    fact: "Absent workLocation fields arrive as explicit JSON null as well as omitted keys.",
    consequence: "Both shapes decode identically; null leaves are not residue.",
    verifiedBy: "fixture",
    evidence: "live-detail.json; nav/src/schema.ts",
  },
  {
    id: "NAV-Q7",
    fact: "`applicationDue` is free text (`Snarest`) as often as a date.",
    consequence: "Only an ISO date prefix becomes a deadline; the raw text stays in residue.",
    verifiedBy: "fixture",
    evidence: "live-detail.json",
  },
  {
    id: "NAV-Q8",
    fact: "Timestamps mix offsets (`Z`, `+02:00`) and precisions.",
    consequence: "Valid-time order compares instants (`Date.parse`), never strings.",
    verifiedBy: "fixture",
    evidence: "live-detail.json vs feed-page.json",
  },
  {
    id: "NAV-Q9",
    fact: "Each detail fetch is one NAV request; bounded hydration makes at most `INGESTION_HYDRATION_PER_RUN` per run.",
    consequence:
      "Default 5 (one feed page's worth) is PROVISIONAL: set it from the first staging measurement (WS-0022 L4).",
    verifiedBy: "unverified",
    evidence: "apps/worker/src/ingestion/hydrationBudget.ts; evidence/WS-0022/README.md",
    provisional: true,
  },
];
