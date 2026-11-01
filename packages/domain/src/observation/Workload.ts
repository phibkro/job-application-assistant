import * as Schema from "effect/Schema";
import { FactState, isDetermined, Method } from "./Ir.ts";
import type { FactState as FactStateType, ObservationContent } from "./Ir.ts";

/**
 * Workload pass @1 (D06): one total decision table from an observation to a workload fact, plus the interval
 * algebra a query uses and the versioned fusion across a vacancy's occurrences. Pure; diagnostics are data.
 *
 * D06 variables, fixed here for v1 and named so a later method version can change them:
 * - FTE reference: `Heltid` maps to the interval [1, 1] (a declared category mapping, not a measurement).
 * - Overlap rule: a query interval and a fact interval *overlap* when they intersect, and the fact is *within* when the
 *   query contains it. `40–80 %` overlaps `40–60 %` and is never reported as one value.
 * - Only determined facts (`Stated`/`Derived`) can match an interval. Every other state is reported as itself.
 */
export const WORKLOAD_METHOD = "workload@1" as const;

/** schema.org `QuantitativeValue` names; fractions of one full-time equivalent. */
export const FteInterval = Schema.Struct({
  minValue: Schema.Finite.check(
    Schema.isBetween({ minimum: 0, maximum: 1, exclusiveMinimum: true }),
  ),
  maxValue: Schema.Finite.check(
    Schema.isBetween({ minimum: 0, maximum: 1, exclusiveMinimum: true }),
  ),
}).check(Schema.makeFilter((i) => i.minValue <= i.maxValue || "minValue must not exceed maxValue"));
export type FteInterval = typeof FteInterval.Type;

/** HR Open schedule category, from the source's own category text. */
export const Schedule = Schema.Literals(["FullTime", "PartTime"]);
export type Schedule = typeof Schedule.Type;

export const WorkloadFact = Schema.Struct({
  state: FactState,
  value: Schema.optionalKey(FteInterval),
  schedule: Schema.optionalKey(Schedule),
  evidence: Schema.Array(Schema.String).check(Schema.isMinLength(1)),
  method: Method,
}).check(
  Schema.makeFilter(
    (f) =>
      isDetermined(f.state) === (f.value !== undefined) ||
      "a workload fact carries an interval exactly when it is Stated or Derived",
  ),
);
export type WorkloadFact = typeof WorkloadFact.Type;

/** A coded diagnostic: data, not a log line, so a test or a report can count and pin them. */
export interface Diagnostic {
  readonly code: DiagnosticCode;
  readonly detail: string;
}
export type DiagnosticCode =
  | "WL001-summary-only"
  | "WL002-unrecognized-extent"
  | "WL003-several-text-values"
  | "WL004-extent-text-disagree"
  | "WL005-no-workload-claim"
  | "WL006-category-without-percentage"
  | "WL007-percentage-out-of-range";

export interface Derivation {
  readonly fact: WorkloadFact;
  readonly diagnostics: ReadonlyArray<Diagnostic>;
}

type TextClaim =
  | { readonly _tag: "Fte"; readonly minValue: number; readonly maxValue: number }
  | { readonly _tag: "Negotiable" };

const RANGE = /(\d{1,3})\s*%?\s*(?:-|–|—|til)\s*(\d{1,3})\s*%/g;
const PERCENT = /(\d{1,3})\s*%/g;
const NEGOTIABLE = /(stillingsprosent|stillingsstørrelse|arbeidstid|omfang)[^.]{0,40}etter avtale/i;

const fraction = (digits: string): number | undefined => {
  const n = Number(digits);
  return n >= 1 && n <= 100 ? n / 100 : undefined;
};

const claimKey = (claim: TextClaim): string =>
  claim._tag === "Negotiable" ? "negotiable" : `${claim.minValue}-${claim.maxValue}`;

/**
 * Workload claims found in free text. Ranges are read and removed before single percentages, so `40–80 %` is one
 * range, not a range plus `80 %`. A percentage outside 1–100 is ignored with a diagnostic.
 *
 * ```ts
 * textClaims("Stillingsprosent 40–80 %.").claims // => [{ _tag: "Fte", minValue: 0.4, maxValue: 0.8 }]
 * textClaims("Stillingen er en 50 % stilling.").claims // => [{ _tag: "Fte", minValue: 0.5, maxValue: 0.5 }]
 * textClaims("Stillingsprosent etter avtale.").claims // => [{ _tag: "Negotiable" }]
 * ```
 */
export const textClaims = (
  text: string,
): {
  readonly claims: ReadonlyArray<TextClaim>;
  readonly diagnostics: ReadonlyArray<Diagnostic>;
} => {
  const ranges = [...text.matchAll(RANGE)].map((match) => {
    const lo = fraction(match[1] ?? "");
    const hi = fraction(match[2] ?? "");
    return lo !== undefined && hi !== undefined && lo <= hi
      ? ({ _tag: "Fte", minValue: lo, maxValue: hi } as const)
      : ({ _tag: "Rejected", text: match[0] } as const);
  });
  const rest = text.replace(RANGE, " ");
  const singles = [...rest.matchAll(PERCENT)].map((match) => {
    const p = fraction(match[1] ?? "");
    return p === undefined
      ? ({ _tag: "Rejected", text: match[0] } as const)
      : ({ _tag: "Fte", minValue: p, maxValue: p } as const);
  });
  const found = [...ranges, ...singles];
  const fte = found.flatMap((c) => (c._tag === "Fte" ? [c] : []));
  const negotiable: ReadonlyArray<TextClaim> = NEGOTIABLE.test(text)
    ? [{ _tag: "Negotiable" }]
    : [];
  const unique = [
    ...new Map([...fte, ...negotiable].map((c) => [claimKey(c), c] as const)).values(),
  ];
  const diagnostics = found.flatMap((c) =>
    c._tag === "Rejected"
      ? [{ code: "WL007-percentage-out-of-range" as const, detail: `ignored "${c.text}"` }]
      : [],
  );
  return { claims: unique.toSorted((a, b) => (claimKey(a) < claimKey(b) ? -1 : 1)), diagnostics };
};

const SCHEDULES: Readonly<Record<string, Schedule>> = { heltid: "FullTime", deltid: "PartTime" };

const scheduleOf = (category: string): Schedule | undefined =>
  SCHEDULES[category.trim().toLowerCase().replace(/\s+/g, " ")];

const FULL: FteInterval = { minValue: 1, maxValue: 1 };

/**
 * The D06 decision table, total over (observation kind, the source category, the text claims). WS-0024 `derive-workload`
 * ported unchanged in its decisions:
 *
 * | category \ text | none        | one %/range                  | negotiable  |
 * | none            | Unknown     | Derived                      | Negotiable  |
 * | Heltid          | Stated 100% | Stated if 100% else Conflict | Conflicting |
 * | Deltid          | Unsupported | Derived if min<1 else Confl. | Negotiable  |
 *
 * A feed summary (no detail yet) is `TempUnknown`; an unrecognised category is `Unknown`; more than one distinct text
 * value is `Conflicting`.
 */
export const deriveWorkload = (content: ObservationContent): Derivation => {
  const category = content.facts.employmentType.value;
  const description = content.facts.description.value ?? "";
  const make = (
    state: FactStateType,
    evidence: ReadonlyArray<string>,
    diagnostics: ReadonlyArray<Diagnostic>,
    extra: { readonly value?: FteInterval; readonly schedule?: Schedule } = {},
  ): Derivation => ({
    fact: {
      state,
      ...(extra.value === undefined ? {} : { value: extra.value }),
      ...(extra.schedule === undefined ? {} : { schedule: extra.schedule }),
      evidence: [...new Set(evidence)].toSorted(),
      method: WORKLOAD_METHOD,
    },
    diagnostics,
  });

  if (content.kind !== "Detail") {
    return make(
      "TempUnknown",
      [
        content.kind === "FeedEntry"
          ? "summary carries no workload"
          : "status-only answer carries no workload",
      ],
      [
        {
          code: "WL001-summary-only",
          detail: `a ${content.kind} observation carries no advert content`,
        },
      ],
    );
  }

  const parsed = textClaims(description);
  const schedule = category === undefined ? undefined : scheduleOf(category);
  const evidence = [
    ...(category === undefined ? [] : [`employmentType=${category}`]),
    ...parsed.claims.map((c) => `text:${claimKey(c)}`),
  ];
  const withSchedule = schedule === undefined ? {} : { schedule };

  if (category !== undefined && schedule === undefined) {
    return make(
      "Unknown",
      [...evidence, "unrecognized employmentType"],
      [
        ...parsed.diagnostics,
        {
          code: "WL002-unrecognized-extent",
          detail: `employmentType "${category}" maps to no schedule`,
        },
      ],
    );
  }
  if (parsed.claims.length > 1) {
    return make(
      "Conflicting",
      evidence,
      [
        ...parsed.diagnostics,
        { code: "WL003-several-text-values", detail: parsed.claims.map(claimKey).join(", ") },
      ],
      withSchedule,
    );
  }

  const claim = parsed.claims[0];
  const disagree: Diagnostic = {
    code: "WL004-extent-text-disagree",
    detail: `${category ?? "no category"} vs ${claim === undefined ? "no text" : claimKey(claim)}`,
  };
  const d = parsed.diagnostics;
  if (claim === undefined) {
    if (schedule === "FullTime") return make("Stated", evidence, d, { value: FULL, schedule });
    if (schedule === "PartTime") {
      return make(
        "Unsupported",
        evidence,
        [
          ...d,
          { code: "WL006-category-without-percentage", detail: "part-time with no percentage" },
        ],
        withSchedule,
      );
    }
    return make(
      "Unknown",
      ["no workload claim"],
      [...d, { code: "WL005-no-workload-claim", detail: "no category and no percentage" }],
    );
  }
  if (claim._tag === "Negotiable") {
    return schedule === "FullTime"
      ? make("Conflicting", evidence, [...d, disagree], withSchedule)
      : make("Negotiable", evidence, d, withSchedule);
  }
  const value: FteInterval = { minValue: claim.minValue, maxValue: claim.maxValue };
  if (schedule === "FullTime") {
    return value.minValue === 1 && value.maxValue === 1
      ? make("Stated", evidence, d, { value, schedule })
      : make("Conflicting", evidence, [...d, disagree], withSchedule);
  }
  if (schedule === "PartTime" && value.minValue >= 1) {
    return make("Conflicting", evidence, [...d, disagree], withSchedule);
  }
  return make("Derived", evidence, d, { value, ...withSchedule });
};

/** Query interval against a fact. `undetermined` for every state that is not Stated/Derived (never coerced). */
export type WorkloadClass = "within" | "overlaps" | "outside" | "undetermined";

export const intervalClass = (
  query: FteInterval,
  fact: FteInterval,
): Exclude<WorkloadClass, "undetermined"> =>
  query.minValue <= fact.minValue && fact.maxValue <= query.maxValue
    ? "within"
    : fact.minValue <= query.maxValue && query.minValue <= fact.maxValue
      ? "overlaps"
      : "outside";

export const classify = (query: FteInterval, fact: WorkloadFact): WorkloadClass =>
  isDetermined(fact.state) && fact.value !== undefined
    ? intervalClass(query, fact.value)
    : "undetermined";

const ABSENT_RANK: Readonly<Partial<Record<FactStateType, number>>> = {
  Unsupported: 2,
  Unknown: 1,
  TempUnknown: 0,
};

const INFORMATIVE = new Set<FactStateType>(["Stated", "Derived", "Negotiable"]);

const valueKey = (fact: WorkloadFact): string =>
  fact.state === "Negotiable" ? "negotiable" : `${fact.value?.minValue}-${fact.value?.maxValue}`;

/**
 * Versioned fusion of workload facts across one vacancy's occurrences (WS-0024 `fuse`). A function of the *set* of
 * inputs, so commutative and idempotent by construction; associativity is a law (`Workload.test.ts`). Distinct
 * informative values, or disagreeing schedules, fuse to `Conflicting` with all evidence and no schedule (keeping one
 * lost the disagreement on re-fusion: the counterexample the WS-0024 associativity law found).
 */
export const fuse = (facts: ReadonlyArray<WorkloadFact>): WorkloadFact => {
  const evidence = [...new Set(facts.flatMap((f) => f.evidence))].toSorted();
  const schedules = new Set(facts.flatMap((f) => (f.schedule === undefined ? [] : [f.schedule])));
  const informative = facts.filter((f) => INFORMATIVE.has(f.state));
  const values = new Map(informative.map((f) => [valueKey(f), f] as const));
  const base = {
    evidence: evidence.length === 0 ? ["no observation"] : evidence,
    method: WORKLOAD_METHOD,
  };
  const onlySchedule = schedules.size === 1 ? { schedule: [...schedules][0] as Schedule } : {};

  if (facts.some((f) => f.state === "Conflicting") || values.size > 1 || schedules.size > 1) {
    return { state: "Conflicting", ...base };
  }
  const [only] = [...values.values()];
  if (only !== undefined) {
    if (only.state === "Negotiable") return { state: "Negotiable", ...onlySchedule, ...base };
    const state = informative.some((f) => f.state === "Stated") ? "Stated" : "Derived";
    return only.value === undefined
      ? { state: "Conflicting", ...base }
      : { state, value: only.value, ...onlySchedule, ...base };
  }
  if (facts.length === 0) return { state: "Unknown", ...base };
  const state = facts
    .map((f) => f.state)
    .reduce((a, b) => ((ABSENT_RANK[b] ?? -1) > (ABSENT_RANK[a] ?? -1) ? b : a));
  return { state, ...onlySchedule, ...base };
};
