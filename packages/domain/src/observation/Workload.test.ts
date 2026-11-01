import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import * as Schema from "effect/Schema";
import { FACT_STATES, isDetermined } from "./Ir.ts";
import { classify, deriveWorkload, fuse, intervalClass, WorkloadFact } from "./Workload.ts";
import type { FteInterval } from "./Workload.ts";
import { content, pool } from "./testkit.ts";

const Q: FteInterval = { minValue: 0.4, maxValue: 0.6 };

const meets = (x: FteInterval, y: FteInterval) => intervalClass(x, y) !== "outside";

const derive = (spec: Parameters<typeof content>[0]) => deriveWorkload(content(spec));

describe("workload pass @1: the D06 decision table (WS-0024 F5 cases)", () => {
  it.each([
    [
      "50 %",
      { description: "Stillingen er en 50 % stilling." },
      "Derived",
      { minValue: 0.5, maxValue: 0.5 },
      "within",
    ],
    [
      "40–80 %",
      { description: "Stillingsprosent 40–80 %." },
      "Derived",
      { minValue: 0.4, maxValue: 0.8 },
      "overlaps",
    ],
    ["Heltid", { employmentType: "Heltid" }, "Stated", { minValue: 1, maxValue: 1 }, "outside"],
    [
      "negotiable",
      { description: "Stillingsprosent etter avtale." },
      "Negotiable",
      undefined,
      "undetermined",
    ],
    ["Deltid, no %", { employmentType: "Deltid" }, "Unsupported", undefined, "undetermined"],
    ["nothing", {}, "Unknown", undefined, "undetermined"],
    [
      "Heltid + 50 %",
      { employmentType: "Heltid", description: "Stillingen er en 50 % stilling." },
      "Conflicting",
      undefined,
      "undetermined",
    ],
    ["feed summary only", { kind: "FeedEntry" as const }, "TempUnknown", undefined, "undetermined"],
  ] as const)("%s → %s", (_name, spec, state, value, cls) => {
    const { fact } = derive({ externalId: "x", ...spec });
    expect(fact.state).toBe(state);
    expect(fact.value).toEqual(value);
    expect(classify(Q, fact)).toBe(cls);
  });

  it("falsifier: 40–80 % is never reported as exactly 50 %, and missing workload is never full-time", () => {
    expect(
      derive({ externalId: "x", description: "Stillingsprosent 40–80 %." }).fact.value,
    ).toEqual({
      minValue: 0.4,
      maxValue: 0.8,
    });
    for (const spec of [
      {},
      { kind: "FeedEntry" as const },
      { employmentType: "Deltid" },
      { kind: "StatusOnly" as const },
    ]) {
      const { fact } = derive({ externalId: "x", ...spec });
      expect(isDetermined(fact.state)).toBe(false);
      expect(fact.value).toBeUndefined();
    }
  });

  it("emits coded diagnostics as data", () => {
    expect(derive({ externalId: "x", kind: "FeedEntry" }).diagnostics.map((d) => d.code)).toEqual([
      "WL001-summary-only",
    ]);
    expect(
      derive({ externalId: "x", employmentType: "Turnus" }).diagnostics.map((d) => d.code),
    ).toEqual(["WL002-unrecognized-extent"]);
    expect(
      derive({ externalId: "x", description: "50 % eller 60 % stilling" }).diagnostics.map(
        (d) => d.code,
      ),
    ).toEqual(["WL003-several-text-values"]);
    expect(
      derive({ externalId: "x", description: "150 % innsats" }).diagnostics.map((d) => d.code),
    ).toEqual(["WL007-percentage-out-of-range", "WL005-no-workload-claim"]);
  });
});

const toFact = (g: {
  readonly state: (typeof FACT_STATES)[number];
  readonly lo: number;
  readonly width: number;
  readonly schedule: "FullTime" | "PartTime" | undefined;
  readonly evidence: ReadonlyArray<string>;
}): WorkloadFact => {
  const base = { state: g.state, evidence: g.evidence.toSorted(), method: "workload@1" };
  const value = isDetermined(g.state)
    ? { minValue: g.lo, maxValue: Math.min(1, g.lo + g.width) }
    : undefined;
  if (value === undefined)
    return g.schedule === undefined ? base : { ...base, schedule: g.schedule };
  return g.schedule === undefined ? { ...base, value } : { ...base, value, schedule: g.schedule };
};

const arbFact: fc.Arbitrary<WorkloadFact> = fc
  .record({
    state: fc.constantFrom(...FACT_STATES),
    lo: fc.constantFrom(0.2, 0.4, 0.5, 1),
    width: fc.constantFrom(0, 0.2, 0.4),
    schedule: fc.constantFrom(undefined, "FullTime" as const, "PartTime" as const),
    evidence: fc.uniqueArray(fc.constantFrom("a", "b", "c"), { minLength: 1, maxLength: 3 }),
  })
  .map(toFact);

const arbFacts = fc.array(arbFact, { maxLength: 5 });

describe("workload pass @1: laws", () => {
  it("law: the pass is deterministic and idempotent (deriving twice gives the same fact and diagnostics)", () => {
    for (const c of pool) {
      expect(deriveWorkload(c)).toEqual(deriveWorkload(structuredClone(c)));
    }
  });

  it("law: every derived and every fused fact conforms to the WorkloadFact schema", () => {
    for (const c of pool) expect(Schema.is(WorkloadFact)(deriveWorkload(c).fact)).toBe(true);
    fc.assert(
      fc.property(arbFacts, (xs) => {
        expect(Schema.is(WorkloadFact)(fuse(xs))).toBe(true);
      }),
    );
  });

  it("law: fuse is commutative, idempotent and associative (order-independent across occurrences)", () => {
    fc.assert(
      fc.property(arbFacts, arbFacts, (a, b) => {
        const xs = [...a, ...b];
        expect(fuse(xs.toReversed())).toEqual(fuse(xs));
        expect(fuse([...xs, ...xs])).toEqual(fuse(xs));
        const parts = [a, b].filter((p) => p.length > 0).map(fuse);
        expect(fuse(parts)).toEqual(fuse(xs));
      }),
    );
  });

  it("law: only a determined fact can match an interval", () => {
    fc.assert(
      fc.property(
        arbFact,
        fc.constantFrom(Q, { minValue: 0.01, maxValue: 1 }, { minValue: 1, maxValue: 1 }),
        (f, q) => {
          const c = classify(q, f);
          expect(isDetermined(f.state) ? c !== "undetermined" : c === "undetermined").toBe(true);
        },
      ),
    );
  });

  it("law: overlap is symmetric, and within implies overlap", () => {
    const intervals: ReadonlyArray<FteInterval> = [
      Q,
      { minValue: 0.5, maxValue: 0.5 },
      { minValue: 0.4, maxValue: 0.8 },
      { minValue: 1, maxValue: 1 },
      { minValue: 0.1, maxValue: 0.3 },
    ];
    fc.assert(
      fc.property(fc.constantFrom(...intervals), fc.constantFrom(...intervals), (a, b) => {
        expect(meets(a, b)).toBe(meets(b, a));
        if (intervalClass(a, b) === "within") expect(meets(b, a)).toBe(true);
      }),
    );
  });
});
