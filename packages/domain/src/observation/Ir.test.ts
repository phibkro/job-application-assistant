import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import {
  ATTRIBUTES,
  decodeObservationContent,
  encodeObservationContent,
  IR_STABILITY,
  IR_VERSION,
  ObservationContent,
  observationId,
} from "./Ir.ts";
import { arbContent, content } from "./testkit.ts";

const reverseKeys = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(reverseKeys)
    : typeof value === "object" && value !== null
      ? Object.fromEntries(
          Object.entries(value)
            .toReversed()
            .map(([k, v]) => [k, reverseKeys(v)]),
        )
      : value;

describe("IR v0", () => {
  it("is experimental, version 0, with the closed schema.org attribute set", () => {
    expect(IR_STABILITY).toBe("experimental");
    expect(IR_VERSION).toBe(0);
    expect(ATTRIBUTES).toEqual([
      "title",
      "hiringOrganization",
      "taxID",
      "jobLocation",
      "url",
      "description",
      "employmentType",
      "totalJobOpenings",
      "datePosted",
      "validThrough",
    ]);
  });

  it("law: round-trip, decode(JSON(encode(x))) = x, and the content address survives it", () => {
    fc.assert(
      fc.property(arbContent, (x) => {
        const wire = JSON.parse(JSON.stringify(encodeObservationContent(x)));
        const back = decodeObservationContent(wire);
        expect(Result.isSuccess(back)).toBe(true);
        if (Result.isSuccess(back)) {
          expect(back.success).toEqual(x);
          expect(observationId(back.success)).toBe(observationId(x));
        }
      }),
    );
  });

  it("law: the content address ignores key order and changes with any content change", () => {
    fc.assert(
      fc.property(arbContent, arbContent, (a, b) => {
        const reordered = reverseKeys(JSON.parse(JSON.stringify(encodeObservationContent(a))));
        expect(observationId(Schema.decodeUnknownSync(ObservationContent)(reordered))).toBe(
          observationId(a),
        );
        if (
          JSON.stringify(encodeObservationContent(a)) !==
          JSON.stringify(encodeObservationContent(b))
        ) {
          expect(observationId(a)).not.toBe(observationId(b));
        }
      }),
    );
  });

  it("rejects a fact whose value disagrees with its state (missing ≠ a default value)", () => {
    const base = encodeObservationContent(content({ externalId: "x" })) as unknown as {
      facts: Record<string, unknown>;
    };
    const valueOnUnknown = {
      ...base,
      facts: {
        ...base.facts,
        totalJobOpenings: { state: "Unknown", value: 1, evidence: ["e"], method: "m@0" },
      },
    };
    const statedWithoutValue = {
      ...base,
      facts: { ...base.facts, title: { state: "Stated", evidence: ["e"], method: "m@0" } },
    };
    const noEvidence = {
      ...base,
      facts: { ...base.facts, title: { state: "Unknown", evidence: [], method: "m@0" } },
    };
    for (const bad of [valueOnUnknown, statedWithoutValue, noEvidence]) {
      expect(Result.isFailure(decodeObservationContent(bad))).toBe(true);
    }
  });

  it("decodes only known IR versions (migrate-by-decode has one member today)", () => {
    const v1 = {
      ...(encodeObservationContent(content({ externalId: "x" })) as object),
      irVersion: 1,
    };
    expect(Result.isFailure(decodeObservationContent(v1))).toBe(true);
  });
});
