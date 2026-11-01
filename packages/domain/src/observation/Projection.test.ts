import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import { applyBatch, occurrenceViews, rebuild } from "./Projection.ts";
import type { WorkloadRow } from "./Projection.ts";
import { history, membership, pool, recordInOrder } from "./testkit.ts";

/** The view without recording metadata (which legitimately depends on arrival). */
const stateOf = (views: ReturnType<typeof occurrenceViews>) =>
  views.map((v) => ({
    key: v.key,
    status: v.status,
    workload: v.workload,
    workloadClass: v.workloadClass,
  }));

describe("projection laws", () => {
  it("law: order-independent, the current state does not depend on arrival order", () => {
    fc.assert(
      fc.property(
        history.chain((h) =>
          fc.tuple(
            fc.constant(h),
            fc.shuffledSubarray(h, { minLength: h.length, maxLength: h.length }),
          ),
        ),
        ([h, shuffled]) => {
          expect(stateOf(occurrenceViews(recordInOrder(shuffled)))).toEqual(
            stateOf(occurrenceViews(recordInOrder(h))),
          );
          expect(rebuild(recordInOrder(shuffled), membership)).toEqual(
            rebuild(recordInOrder(h), membership),
          );
        },
      ),
    );
  });

  it("law: idempotent, replaying observations already seen changes nothing", () => {
    fc.assert(
      fc.property(history, history, (h, more) => {
        const once = recordInOrder([...h, ...more]);
        const replayed = recordInOrder([...h, ...more, ...h]);
        expect(replayed).toEqual(once);
        expect(occurrenceViews(replayed)).toEqual(occurrenceViews(once));
        expect(rebuild(replayed, membership)).toEqual(rebuild(once, membership));
      }),
    );
  });

  it("law: incremental maintenance (refresh only touched vacancies, batch by batch) equals a full rebuild", () => {
    fc.assert(
      fc.property(fc.array(history, { minLength: 1, maxLength: 4 }), (batches) => {
        const all = recordInOrder(batches.flat());
        const byId = new Map(all.map((o) => [o.id, o] as const));
        const recordedBatches = batches.map((b) =>
          b.map((c) => recordInOrder([c])[0]!).map((o) => byId.get(o.id)!),
        );
        const stored = new Map<string, (typeof all)[number]>();
        let rows: ReadonlyMap<string, WorkloadRow> = new Map();
        for (const batch of recordedBatches) {
          for (const o of batch) stored.set(o.id, o);
          rows = applyBatch(rows, [...stored.values()], batch, membership);
        }
        expect(
          [...rows.values()].toSorted((a, b) => (a.canonicalJobId < b.canonicalJobId ? -1 : 1)),
        ).toEqual(rebuild(all, membership));
      }),
    );
  });

  it("law: as-of is stable, the answer as of t is unchanged by observations recorded after t", () => {
    fc.assert(
      fc.property(history, history, (h, later) => {
        const before = recordInOrder(h);
        const t = before.length;
        const after = recordInOrder([...h, ...later]);
        expect(occurrenceViews(after, { asOf: t })).toEqual(occurrenceViews(before));
      }),
    );
  });

  it("a late-arriving older observation never overrides a newer one (valid time wins over arrival)", () => {
    const h1 = pool.filter((c) => c.externalId === "h-1");
    const newest = h1[h1.length - 1]!;
    const inArrival = recordInOrder([newest, ...h1.slice(0, -1)]);
    expect(occurrenceViews(inArrival)[0]?.status).toBe(newest.status);
  });
});
