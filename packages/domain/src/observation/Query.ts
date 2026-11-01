import * as Schema from "effect/Schema";
import { FactState } from "./Ir.ts";
import type { WorkloadRow } from "./Projection.ts";
import { classify, WORKLOAD_METHOD } from "./Workload.ts";
import type { FteInterval, WorkloadClass, WorkloadFact } from "./Workload.ts";

/**
 * The experimental workload filter on `GET /api/v1/jobs` (WS-0022 user-visible outcome): a page of vacancies grouped
 * by workload fact state. Pure; the handler only reads the projection rows and calls `groupByWorkload`.
 *
 * - `matches`: determined (`Stated`/`Derived`) and *within* or *overlapping* the query interval;
 * - `negotiable`, `conflicting`, `unknown`, `tempUnknown`, `unsupported`: reported as themselves, never coerced;
 * - a determined interval *outside* the query is excluded (counted, not listed).
 *
 * A vacancy with no projection row has never been observed into the store (it predates WS-0022, or its page has not
 * been committed since): `tempUnknown`, never full-time.
 */
export const WORKLOAD_GROUPS = [
  "matches",
  "negotiable",
  "conflicting",
  "unknown",
  "tempUnknown",
  "unsupported",
] as const;
export type WorkloadGroup = (typeof WORKLOAD_GROUPS)[number];

const GROUP_OF_STATE: Readonly<Record<FactState, WorkloadGroup>> = {
  Stated: "matches",
  Derived: "matches",
  Negotiable: "negotiable",
  Conflicting: "conflicting",
  Unknown: "unknown",
  TempUnknown: "tempUnknown",
  Unsupported: "unsupported",
};

export const WorkloadEntry = Schema.Struct({
  id: Schema.String,
  state: FactState,
  minValue: Schema.optionalKey(Schema.Number),
  maxValue: Schema.optionalKey(Schema.Number),
  overlap: Schema.optionalKey(Schema.Literals(["within", "overlaps"])),
});
export type WorkloadEntry = typeof WorkloadEntry.Type;

/** The additive `workload` section of a `JobPage`: present only when the request asked for a workload interval. */
export const WorkloadSection = Schema.Struct({
  stability: Schema.Literal("experimental"),
  method: Schema.String,
  query: Schema.Struct({ minValue: Schema.Number, maxValue: Schema.Number }),
  excluded: Schema.Number,
  groups: Schema.Struct({
    matches: Schema.Array(Schema.String),
    negotiable: Schema.Array(Schema.String),
    conflicting: Schema.Array(Schema.String),
    unknown: Schema.Array(Schema.String),
    tempUnknown: Schema.Array(Schema.String),
    unsupported: Schema.Array(Schema.String),
  }),
  facts: Schema.Array(WorkloadEntry),
});
export type WorkloadSection = typeof WorkloadSection.Type;

const NOT_OBSERVED: WorkloadFact = {
  state: "TempUnknown",
  evidence: ["no observation in the store yet"],
  method: WORKLOAD_METHOD,
};

export const factOfRow = (row: WorkloadRow | undefined): WorkloadFact =>
  row === undefined
    ? NOT_OBSERVED
    : {
        state: row.workloadState,
        ...(row.workloadMin !== null && row.workloadMax !== null
          ? { value: { minValue: row.workloadMin, maxValue: row.workloadMax } }
          : {}),
        evidence: [`workload_projection ${row.workloadMethod}`],
        method: row.workloadMethod,
      };

interface Classified {
  readonly id: string;
  readonly fact: WorkloadFact;
  readonly cls: WorkloadClass;
}

const entryOf = (c: Classified): WorkloadEntry => {
  const overlap = c.cls === "within" || c.cls === "overlaps" ? c.cls : undefined;
  const base = { id: c.id, state: c.fact.state };
  const withValue =
    c.fact.value === undefined
      ? base
      : { ...base, minValue: c.fact.value.minValue, maxValue: c.fact.value.maxValue };
  return overlap === undefined ? withValue : { ...withValue, overlap };
};

export interface Grouped {
  /** The ids to return, in scan order (excluded ones removed). */
  readonly kept: ReadonlyArray<string>;
  readonly section: WorkloadSection;
}

/**
 * Groups one scanned page. `classifyWith` defaults to the workload pass's `classify`; it is a parameter only so a
 * negative control can swap it (WS-0024 C5b: an interval collapsed to its midpoint).
 */
export const groupByWorkload = (
  query: FteInterval,
  ids: ReadonlyArray<string>,
  rows: ReadonlyMap<string, WorkloadRow>,
  classifyWith: (query: FteInterval, fact: WorkloadFact) => WorkloadClass = classify,
): Grouped => {
  const classified = ids.map((id): Classified => {
    const fact = factOfRow(rows.get(id));
    return { id, fact, cls: classifyWith(query, fact) };
  });
  const kept = classified.filter((c) => c.cls !== "outside");
  const groupOf = (c: (typeof kept)[number]): WorkloadGroup =>
    c.cls === "undetermined" ? GROUP_OF_STATE[c.fact.state] : "matches";
  const idsIn = (group: WorkloadGroup): ReadonlyArray<string> =>
    kept.filter((c) => groupOf(c) === group).map((c) => c.id);
  const groups: Record<WorkloadGroup, ReadonlyArray<string>> = {
    matches: idsIn("matches"),
    negotiable: idsIn("negotiable"),
    conflicting: idsIn("conflicting"),
    unknown: idsIn("unknown"),
    tempUnknown: idsIn("tempUnknown"),
    unsupported: idsIn("unsupported"),
  };
  return {
    kept: kept.map((c) => c.id),
    section: {
      stability: "experimental",
      method: WORKLOAD_METHOD,
      query: { minValue: query.minValue, maxValue: query.maxValue },
      excluded: classified.length - kept.length,
      groups,
      facts: kept.map(entryOf),
    },
  };
};

/**
 * `workloadMin`/`workloadMax` as percentages (1–100, min ≤ max) to an FTE interval. `undefined` when both are absent;
 * a half-given or malformed pair is a caller error.
 */
export const parseWorkloadQuery = (
  min: string | undefined,
  max: string | undefined,
):
  | { readonly _tag: "Absent" }
  | { readonly _tag: "Query"; readonly query: FteInterval }
  | { readonly _tag: "Invalid"; readonly reason: string } => {
  if (min === undefined && max === undefined) return { _tag: "Absent" };
  const lo = Number(min);
  const hi = Number(max);
  if (!Number.isInteger(lo) || !Number.isInteger(hi) || lo < 1 || hi > 100 || lo > hi) {
    return {
      _tag: "Invalid",
      reason: "workloadMin and workloadMax must be integer percentages, 1 <= min <= max <= 100",
    };
  }
  return { _tag: "Query", query: { minValue: lo / 100, maxValue: hi / 100 } };
};
