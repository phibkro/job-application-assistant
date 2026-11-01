import * as fc from "fast-check";
import { fact, FACT_STATES, isDetermined, observationId } from "./Ir.ts";
import type {
  Fact,
  FactState,
  ListingFacts,
  ListingObservation,
  ObservationContent,
  ObservationKind,
} from "./Ir.ts";

/**
 * Test support for the observation laws: builders and fast-check arbitraries. Not production code (excluded from the
 * pure-core boundary scan and from coverage); imported only by `*.test.ts`.
 */

const M = "test-import@0";

const absentFact = (state: FactState = "Unknown"): Fact<never> =>
  fact(state, M, [`absent (${state})`]);

export const textFactOf = (value: string | undefined, state: FactState = "Stated"): Fact<string> =>
  value === undefined
    ? absentFact(state === "Stated" ? "Unknown" : state)
    : fact(state, M, [`path:${value}`], value);

export interface ContentSpec {
  readonly externalId: string;
  readonly source?: string;
  readonly kind?: ObservationKind;
  readonly status?: string;
  readonly dateModified?: string;
  readonly employmentType?: string;
  readonly description?: string;
  readonly title?: string;
  readonly url?: string;
}

/** A well-formed IR v0 observation with the given facts; everything unspecified is `Unknown`. */
export const content = (spec: ContentSpec): ObservationContent => {
  const facts: ListingFacts = {
    title: textFactOf(spec.title ?? "Support specialist"),
    hiringOrganization: textFactOf("Example AS"),
    taxID: absentFact(spec.kind === "FeedEntry" ? "TempUnknown" : "Unknown"),
    jobLocation: textFactOf("Oslo"),
    url: textFactOf(spec.url ?? `https://example.test/${spec.externalId}`),
    description: textFactOf(spec.description),
    employmentType:
      spec.employmentType === undefined
        ? absentFact(spec.kind === "FeedEntry" ? "TempUnknown" : "Unknown")
        : textFactOf(spec.employmentType),
    totalJobOpenings: absentFact(),
    datePosted: absentFact(),
    validThrough: absentFact(),
  };
  return {
    irVersion: 0,
    source: spec.source ?? "nav",
    externalId: spec.externalId,
    kind: spec.kind ?? "Detail",
    status: spec.status ?? "ACTIVE",
    ...(spec.dateModified === undefined ? {} : { dateModified: spec.dateModified }),
    facts,
    residue: [],
  };
};

/** Recorded in arrival order: the store's behaviour (`recordedSeq` is MAX + 1 per new id). */
export const recordInOrder = (
  contents: ReadonlyArray<ObservationContent>,
): ReadonlyArray<ListingObservation> => {
  const seen = new Map<string, ListingObservation>();
  for (const c of contents) {
    const id = observationId(c);
    if (!seen.has(id)) {
      seen.set(id, {
        id,
        content: c,
        recorded: {
          recordedSeq: seen.size + 1,
          recordedAt: `2026-11-01T00:00:${String(seen.size).padStart(2, "0")}Z`,
          runId: "law",
        },
      });
    }
  }
  return [...seen.values()];
};

const TEXTS = [
  undefined,
  "Stillingen er en 50 % stilling.",
  "Stillingsprosent 40–80 %.",
  "Stillingsprosent etter avtale.",
  "Full stilling, 100 %.",
];
const CATEGORIES = [undefined, "Heltid", "Deltid", "Heltid og deltid"];

/**
 * A pool of observations: 3 occurrences × 5 source hours, with kind, status, category and text picked
 * deterministically from (occurrence, hour). Source times are distinct per occurrence, so valid-time order is total.
 */
export const pool: ReadonlyArray<ObservationContent> = ["h-1", "h-2", "h-3"].flatMap(
  (externalId, i) =>
    [8, 9, 10, 11, 12].map((hour) => {
      const k = 7 * i + hour;
      return content({
        externalId,
        kind: k % 4 === 0 ? "FeedEntry" : "Detail",
        status: k % 5 === 0 ? "INACTIVE" : "ACTIVE",
        dateModified: `2026-08-05T${String(hour).padStart(2, "0")}:00:00Z`,
        employmentType: CATEGORIES[k % CATEGORIES.length],
        description: TEXTS[k % TEXTS.length],
      });
    }),
);

export const history = fc.array(fc.constantFrom(...pool), { minLength: 1, maxLength: 12 });

/** Each occurrence's vacancy; `h-1` and `h-2` share one (a D05-style merge), `h-3` is alone. */
export const membership: ReadonlyMap<string, string> = new Map([
  ["nav|h-1", "job-a"],
  ["nav|h-2", "job-a"],
  ["nav|h-3", "job-b"],
]);

/** Arbitrary well-formed facts over strings: a value exactly when determined. */
const arbTextFact = fc.constantFrom(...FACT_STATES).chain((state) =>
  fc
    .record({
      evidence: fc.array(fc.string({ minLength: 1, maxLength: 8 }), { minLength: 1, maxLength: 3 }),
      value: fc.string({ maxLength: 12 }),
    })
    .map(({ evidence, value }) =>
      isDetermined(state)
        ? fact<string>(state, M, evidence, value)
        : fact<string>(state, M, evidence),
    ),
);

const arbCountFact = fc
  .constantFrom(...FACT_STATES)
  .chain((state) =>
    fc
      .integer({ min: 1, max: 50 })
      .map((value) =>
        isDetermined(state)
          ? fact<number>(state, M, ["path:positioncount"], value)
          : fact<number>(state, M, ["absent"]),
      ),
  );

const withEnvelope = ({
  dateModified,
  ...rest
}: Omit<ObservationContent, "irVersion" | "source" | "dateModified"> & {
  readonly dateModified: string | undefined;
}): ObservationContent => {
  const base = { irVersion: 0 as const, source: "nav", ...rest };
  return dateModified === undefined ? base : { ...base, dateModified };
};

/** Arbitrary IR v0 content, for the round-trip law. */
export const arbContent: fc.Arbitrary<ObservationContent> = fc
  .record({
    externalId: fc.string({ minLength: 1, maxLength: 10 }).filter((s) => s.trim().length > 0),
    kind: fc.constantFrom<ObservationKind>("FeedEntry", "Detail", "StatusOnly"),
    status: fc.constantFrom("ACTIVE", "INACTIVE", "STOPPED"),
    dateModified: fc.option(
      fc.constantFrom("2026-08-05T08:00:00Z", "2026-08-06T21:59:39.904+02:00"),
      { nil: undefined },
    ),
    facts: fc.record({
      title: arbTextFact,
      hiringOrganization: arbTextFact,
      taxID: arbTextFact,
      jobLocation: arbTextFact,
      url: arbTextFact,
      description: arbTextFact,
      employmentType: arbTextFact,
      totalJobOpenings: arbCountFact,
      datePosted: arbTextFact,
      validThrough: arbTextFact,
    }),
    residue: fc.array(
      fc.record({ path: fc.string({ maxLength: 10 }), value: fc.string({ maxLength: 10 }) }),
      {
        maxLength: 4,
      },
    ),
  })
  .map(withEnvelope);
