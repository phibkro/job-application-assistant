import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import { observationId } from "@job-index/domain/observation/Ir";
import type { ListingObservation, ObservationContent } from "@job-index/domain/observation/Ir";
import {
  byRecordedTime,
  goodStrategies,
  occurrenceKey,
  occurrenceViews,
  projectJobs,
} from "@job-index/domain/observation/Projection";
import type { Strategies, ViewOptions } from "@job-index/domain/observation/Projection";
import { intervalClass } from "@job-index/domain/observation/Workload";
import { isDetermined } from "@job-index/domain/observation/Ir";
import { runTest } from "../db/TestLayer.ts";
import * as Store from "./store.ts";
import {
  ACTIVE_ITEM,
  detail,
  detailContent,
  FEED_PAGE,
  feedContents,
  FIFTY,
  LIVE_DETAIL,
  page,
  POSTING_URL,
  withStatus,
  withUuid,
} from "./testSupport.ts";

/**
 * WS-0024's falsifiers F1, F2, F3, F5, F6 (recorded-time as-of) and F7, ported to TS against the real store: D1
 * inside workerd, with the migration-0006 schema and its triggers. F4 (identity, `sameAs`) is TB-02's.
 *
 * Every strategy a falsifier depends on is one field of `Impl`, so each control (F7) is `good` with exactly one field
 * swapped, and must make its target falsifier fail. A falsifier whose control passes is not evidence.
 */

interface Impl {
  readonly feed: (json: unknown) => ReadonlyArray<ObservationContent>;
  readonly idOf: (content: ObservationContent) => string;
  readonly strategies: Strategies;
}

const good: Impl = { feed: feedContents, idOf: observationId, strategies: goodStrategies };

let run = 0;
const ingest = (impl: Impl, contents: ReadonlyArray<ObservationContent>) =>
  runTest(
    Effect.gen(function* () {
      run += 1;
      const inserted = yield* Store.append(
        contents,
        { runId: `run-${run}`, recordedAt: "2026-11-01T00:00:00Z" },
        impl.idOf,
      );
      return { inserted, t: yield* Store.maxRecordedSeq };
    }),
  );

const stored = () => runTest(Store.all);

const view = async (impl: Impl, options: ViewOptions = {}) =>
  occurrenceViews(await stored(), options, impl.strategies);

const byExternalId = (views: Awaited<ReturnType<typeof view>>) =>
  new Map(views.map((v) => [v.externalId, v] as const));

/** Change cursor: occurrences that received a new observation after recorded time `t`. */
const changedSince = (observations: ReadonlyArray<ListingObservation>, t: number) =>
  new Set(
    observations
      .filter((o) => o.recorded.recordedSeq > t)
      .map((o) => occurrenceKey(o.content.source, o.content.externalId)),
  );

// ---------------------------------------------------------------------------------------------------- falsifiers

const f1 = async (impl: Impl) => {
  await ingest(impl, impl.feed(FEED_PAGE));
  const views = await view(impl);
  const active = views.filter((v) => v.active);
  expect(active).toHaveLength(1);
  expect(
    active.map((v) => ({
      source: v.source,
      externalId: v.externalId,
      url: v.url,
      status: v.status,
    })),
  ).toEqual([
    { source: "nav", externalId: "active-vacancy-1", url: POSTING_URL, status: "ACTIVE" },
  ]);
  const ids = new Set((await stored()).map((o) => o.id));
  expect(active[0]!.observationIds.every((id) => ids.has(id))).toBe(true);
  expect(active[0]!.observationIds).toHaveLength(1);
  // The INACTIVE entry is recorded, not dropped, and is not active.
  expect(views.filter((v) => !v.active).map((v) => v.externalId)).toEqual(["inactive-vacancy-2"]);
};

const f2 = async (impl: Impl) => {
  const batch = [...impl.feed(FEED_PAGE), detailContent(detail("active-vacancy-1"))];
  const first = await ingest(impl, batch);
  const before = await view(impl);
  const replay = await ingest(impl, batch);
  expect(first.inserted).toBeGreaterThan(0);
  expect(replay.inserted).toBe(0);
  expect(await view(impl)).toEqual(before);
  expect(changedSince(await stored(), first.t)).toEqual(new Set());
};

const f3 = async (impl: Impl) => {
  const opened = await ingest(impl, impl.feed(page(ACTIVE_ITEM)));
  await ingest(impl, impl.feed(page(withStatus(ACTIVE_ITEM, "INACTIVE", "2026-08-05T09:00:00Z"))));
  const statusOf = async (options: ViewOptions) => (await view(impl, options))[0]?.active;
  expect(await statusOf({})).toBe(false);
  expect(await statusOf({ asOf: opened.t })).toBe(true);
  expect(await statusOf({ validAt: Date.parse("2026-08-05T08:30:00Z") })).toBe(true);
  expect(changedSince(await stored(), opened.t)).toEqual(new Set(["nav|active-vacancy-1"]));
};

/** The F5 cases: the contract's 50 %, 40–80 %, 100 %, negotiable, `Deltid` with no %, nothing, plus summary-only and a contradiction, so all seven states occur. */
const workloadCases = (): ReadonlyArray<
  readonly [
    ObservationContent,
    { readonly state: string; readonly value?: unknown; readonly cls: string },
  ]
> => [
  [
    detailContent(detail("wl-50", { append: FIFTY })),
    { state: "Derived", value: { minValue: 0.5, maxValue: 0.5 }, cls: "within" },
  ],
  [
    detailContent(detail("wl-40-80", { append: "Stillingsprosent 40–80 %." })),
    { state: "Derived", value: { minValue: 0.4, maxValue: 0.8 }, cls: "overlaps" },
  ],
  [
    detailContent(detail("wl-100", { extent: "Heltid" })),
    { state: "Stated", value: { minValue: 1, maxValue: 1 }, cls: "outside" },
  ],
  [
    detailContent(detail("wl-negotiable", { append: "Stillingsprosent etter avtale." })),
    { state: "Negotiable", cls: "undetermined" },
  ],
  // The recorded live NAV detail, unmodified: extent `Deltid`, no percentage.
  [detailContent(LIVE_DETAIL), { state: "Unsupported", cls: "undetermined" }],
  [detailContent(detail("wl-nothing")), { state: "Unknown", cls: "undetermined" }],
  [
    feedContents(page(withUuid(ACTIVE_ITEM, "wl-temp")))[0]!,
    { state: "TempUnknown", cls: "undetermined" },
  ],
  [
    detailContent(detail("wl-conflict", { extent: "Heltid", append: FIFTY })),
    { state: "Conflicting", cls: "undetermined" },
  ],
];

const f5 = async (impl: Impl) => {
  const cases = workloadCases();
  await ingest(
    impl,
    cases.map(([c]) => c),
  );
  const views = byExternalId(await view(impl, { query: { minValue: 0.4, maxValue: 0.6 } }));
  for (const [c, expected] of cases) {
    const v = views.get(c.externalId)!;
    expect(
      { state: v.workload.state, value: v.workload.value, cls: v.workloadClass },
      c.externalId,
    ).toEqual({
      state: expected.state,
      value: expected.value,
      cls: expected.cls,
    });
  }
  expect(new Set([...views.values()].map((v) => v.workload.state)).size).toBe(7);
  expect(
    [...views.values()].filter((v) => v.workloadClass === "within").map((v) => v.externalId),
  ).toEqual(["wl-50"]);
  // Fusion across one vacancy's occurrences: 50 % and 100 % fuse to Conflicting, never to either value.
  const all = await stored();
  const [fused] = projectJobs(
    ["job"],
    all,
    new Map([
      ["nav|wl-50", "job"],
      ["nav|wl-100", "job"],
    ]),
    impl.strategies,
  );
  expect(fused?.workloadState).toBe("Conflicting");
  expect(fused?.workloadMin).toBeNull();
};

const f6 = async (impl: Impl) => {
  const cases = workloadCases().map(([c]) => c);
  const t1 = (await ingest(impl, [...impl.feed(FEED_PAGE), ...cases.slice(0, 4)])).t;
  const atT1 = await view(impl);
  await ingest(impl, [
    ...cases.slice(4),
    ...impl.feed(page(withStatus(ACTIVE_ITEM, "INACTIVE", "2026-08-05T09:00:00Z"))),
    detailContent(
      detail("wl-50", { append: "Stillingsprosent 40–80 %.", modified: "2026-08-05T12:00:00Z" }),
    ),
  ]);
  expect(await view(impl)).not.toEqual(atT1);
  expect(await view(impl, { asOf: t1 })).toEqual(atT1);
};

const f6LateArrival = async (impl: Impl) => {
  await ingest(impl, impl.feed(page(withStatus(ACTIVE_ITEM, "INACTIVE", "2026-08-05T10:00:00Z"))));
  await ingest(impl, impl.feed(page(withStatus(ACTIVE_ITEM, "ACTIVE", "2026-08-05T09:00:00Z")))); // delayed delivery
  expect((await view(impl))[0]?.active).toBe(false);
  expect((await view(impl, { validAt: Date.parse("2026-08-05T09:30:00Z") }))[0]?.active).toBe(true);
};

// ---------------------------------------------------------------------------------------------------- controls (F7)

const swap = (strategies: Partial<Strategies>): Impl => ({
  ...good,
  strategies: { ...goodStrategies, ...strategies },
});

/** C1's defect: the observation keyed by the feed item's own `id` (`entry-1`), not NAV's uuid. */
const reidentified = (c: ObservationContent, itemId: string | undefined): ObservationContent =>
  Object.assign({}, c, { externalId: itemId ?? c.externalId });

let nonce = 0;
const controls: ReadonlyArray<{
  readonly id: string;
  readonly target: string;
  readonly broken: string;
  readonly impl: Impl;
}> = [
  {
    id: "C1",
    target: "F1",
    broken: "external id read from the feed item `id` instead of `_feed_entry.uuid`",
    impl: {
      ...good,
      feed: (json) =>
        feedContents(json).map((c, i) =>
          reidentified(c, (json as { items: ReadonlyArray<{ id: string }> }).items[i]?.id),
        ),
    },
  },
  {
    id: "C2",
    target: "F2",
    broken: "observation id includes a receipt nonce (not content-addressed)",
    impl: { ...good, idOf: (c) => `${observationId(c)}@${(nonce += 1)}` },
  },
  {
    id: "C3",
    target: "F3",
    broken: "status = 'ever seen ACTIVE' (closure never propagates)",
    impl: swap({
      statusOf: (ordered) =>
        ordered.some((o) => o.content.status === "ACTIVE") ? "ACTIVE" : "INACTIVE",
    }),
  },
  {
    id: "C5a",
    target: "F5",
    broken: "missing workload treated as Stated 100 %",
    impl: swap({
      deriveWorkload: (o) => {
        const f = goodStrategies.deriveWorkload(o);
        return ["Unknown", "Unsupported", "TempUnknown"].includes(f.state)
          ? { ...f, state: "Stated", value: { minValue: 1, maxValue: 1 } }
          : f;
      },
    }),
  },
  {
    id: "C5b",
    target: "F5",
    broken: "interval collapsed to its midpoint (40–80 % reported as one value)",
    impl: swap({
      classify: (q, f) => {
        if (!isDetermined(f.state) || f.value === undefined) return "undetermined";
        const m = (f.value.minValue + f.value.maxValue) / 2;
        return intervalClass(q, { minValue: m, maxValue: m });
      },
    }),
  },
  {
    id: "C6a",
    target: "F6",
    broken: "as-of ignored (reads the current store)",
    impl: swap({ asOf: (observations) => observations }),
  },
  {
    id: "C6b",
    target: "F6 (late arrival)",
    broken: "status by arrival (recorded) order, last write wins",
    impl: swap({ order: byRecordedTime }),
  },
];

const falsifiers: Readonly<Record<string, (impl: Impl) => Promise<void>>> = {
  F1: f1,
  F2: f2,
  F3: f3,
  F5: f5,
  F6: f6,
  "F6 (late arrival)": f6LateArrival,
};

describe("WS-0024 falsifiers in TS, against the real D1 store (WS-0022 acceptance)", () => {
  it("F1: ingesting a NAV fixture makes the vacancy queryable with its source reference; INACTIVE is recorded, not dropped", () =>
    f1(good));
  it("F2: an identical replay is a semantic no-op (0 rows, same view, empty change cursor)", () =>
    f2(good));
  it("F3: INACTIVE propagates as visible closure: closed now, active as of before, active at valid time 08:30", () =>
    f3(good));
  it("F5: a 40–60 % query separates all seven fact states; only the 50 % advert is within; missing is never full-time", () =>
    f5(good));
  it("F6: the answer as of recorded time t1 is reproducible after later observations", () =>
    f6(good));
  it("F6: a late-arriving older observation does not override a newer one", () =>
    f6LateArrival(good));
});

describe("F7: every control makes its target falsifier fail", () => {
  it("each falsifier in scope has at least one control", () => {
    expect([...new Set(controls.map((c) => c.target))].toSorted()).toEqual(
      Object.keys(falsifiers).toSorted(),
    );
  });
  for (const control of controls) {
    it(`${control.id} (${control.broken}) fails ${control.target}`, async () => {
      const failure: unknown = await falsifiers[control.target]!(control.impl).then(
        () => undefined,
        (error: unknown) => error,
      );
      // An assertion of the falsifier failed, not a crash in its setup: the control is seen by the check itself.
      expect((failure as Error | undefined)?.name).toBe("AssertionError");
    });
  }
});
