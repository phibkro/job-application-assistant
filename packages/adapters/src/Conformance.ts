import { describe, expect, it } from "vitest";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { ObservationContent, observationId } from "@job-index/domain/observation/Ir";
import type { Attribute } from "@job-index/domain/observation/Ir";
import { deriveWorkload } from "@job-index/domain/observation/Workload";

/**
 * `defineSourceConformance(importer, fixtures, twins)`: one shared suite every source importer must pass (lead handoff
 * "Verification"; the pg-outbox conformance-plus-mutation-controls pattern). Each numbered guarantee is one check,
 * and each has a deliberately broken twin that the check must catch; a check whose twin passes cannot see the defect.
 *
 * Thin on purpose (WS-0022 L1): only this slice's guarantees. Wider ones (identity, `sameAs`) wait for TB-02.
 *
 * - **G1 replay is a no-op**: importing the same payload twice yields identical observations, so identical content
 *   addresses (no receipt time or nonce in the content).
 * - **G2 closure is visible**: a closed entry is observed, with a non-ACTIVE status, not filtered away.
 * - **G3 no fabricated workload**: where the payload carries no workload evidence, neither the importer's
 *   `employmentType` nor the workload pass is determined (missing ≠ full-time).
 * - **G4 evidence on every fact**: every fact of every observation names its evidence and method, and every
 *   observation decodes as the IR.
 */

export interface Payload {
  readonly kind: "feed" | "detail" | "closed";
  readonly json: unknown;
}

export interface SourceImporter {
  readonly source: string;
  readonly importPayload: (
    payload: Payload,
  ) => Result.Result<ReadonlyArray<ObservationContent>, unknown>;
}

export interface ConformanceFixtures {
  /** Every payload; G1 and G4 run over all of them. */
  readonly payloads: ReadonlyArray<Payload>;
  /** A payload holding a closed entry, and that entry's external id (G2). */
  readonly closure: { readonly payload: Payload; readonly externalId: string };
  /** Payloads that carry no workload evidence at all (G3). */
  readonly noWorkload: ReadonlyArray<Payload>;
}

export type GuaranteeId = "G1" | "G2" | "G3" | "G4";

export const GUARANTEES: Readonly<Record<GuaranteeId, string>> = {
  G1: "replay is a no-op: the same payload imports to the same content addresses",
  G2: "closure is visible: a closed entry is observed with a non-ACTIVE status",
  G3: "no fabricated workload: no workload evidence gives no determined workload",
  G4: "evidence on every fact: each fact names evidence and a method, and decodes as the IR",
};

const imported = (
  importer: SourceImporter,
  payload: Payload,
): ReadonlyArray<ObservationContent> => {
  const result = importer.importPayload(payload);
  if (Result.isFailure(result))
    throw new Error(`${importer.source}: a conformance fixture failed to import`);
  return result.success;
};

/** The failure message of one guarantee against one importer, or `undefined` when it holds. */
export const checkGuarantee = (
  id: GuaranteeId,
  importer: SourceImporter,
  fixtures: ConformanceFixtures,
): string | undefined => {
  switch (id) {
    case "G1":
      for (const payload of fixtures.payloads) {
        const first = imported(importer, payload).map(observationId);
        const again = imported(importer, payload).map(observationId);
        if (JSON.stringify(first) !== JSON.stringify(again))
          return `replay changed the ids of a ${payload.kind} payload`;
      }
      return undefined;
    case "G2": {
      const closed = imported(importer, fixtures.closure.payload).filter(
        (o) => o.externalId === fixtures.closure.externalId,
      );
      if (closed.length === 0)
        return `closed entry ${fixtures.closure.externalId} was not observed`;
      return closed.every((o) => o.status !== "ACTIVE")
        ? undefined
        : "a closed entry was observed as ACTIVE";
    }
    case "G3":
      for (const payload of fixtures.noWorkload) {
        for (const o of imported(importer, payload)) {
          const category = o.facts.employmentType;
          const workload = deriveWorkload(o).fact;
          if (
            category.state === "Stated" ||
            category.state === "Derived" ||
            workload.value !== undefined
          ) {
            return `${o.externalId}: workload was determined with no evidence (${workload.state})`;
          }
        }
      }
      return undefined;
    case "G4":
      for (const payload of fixtures.payloads) {
        for (const o of imported(importer, payload)) {
          const externalId = o.externalId;
          if (!Schema.is(ObservationContent)(o)) return `${externalId}: does not decode as the IR`;
          for (const [attribute, fact] of Object.entries(o.facts) as ReadonlyArray<
            readonly [
              Attribute,
              { readonly evidence: ReadonlyArray<string>; readonly method: string },
            ]
          >) {
            if (fact.evidence.length === 0 || fact.method === "")
              return `${o.externalId}.${attribute}: no evidence`;
          }
        }
      }
      return undefined;
  }
};

export interface BrokenTwin {
  readonly id: string;
  readonly breaks: GuaranteeId;
  readonly describe: string;
  readonly importer: SourceImporter;
}

/** Registers one test per guarantee (must hold) and one per broken twin (its guarantee must fail). */
export const defineSourceConformance = (
  importer: SourceImporter,
  fixtures: ConformanceFixtures,
  twins: ReadonlyArray<BrokenTwin>,
): void => {
  describe(`source conformance: ${importer.source}`, () => {
    for (const [id, text] of Object.entries(GUARANTEES) as ReadonlyArray<
      readonly [GuaranteeId, string]
    >) {
      it(`${id} holds: ${text}`, () => {
        expect(checkGuarantee(id, importer, fixtures)).toBeUndefined();
      });
    }
    it("every guarantee has at least one broken twin", () => {
      expect([...new Set(twins.map((t) => t.breaks))].toSorted()).toEqual(
        Object.keys(GUARANTEES).toSorted(),
      );
    });
    for (const twin of twins) {
      it(`control ${twin.id} (${twin.describe}) is caught by ${twin.breaks}`, () => {
        expect(checkGuarantee(twin.breaks, twin.importer, fixtures)).toBeDefined();
      });
    }
  });
};
