import type { FactState, ListingObservation } from "./Ir.ts";
import { classify, deriveWorkload, fuse, WORKLOAD_METHOD } from "./Workload.ts";
import type { FteInterval, WorkloadClass, WorkloadFact } from "./Workload.ts";

/**
 * Read models over stored observations: per-occurrence state on both time axes, and the rebuildable per-vacancy
 * workload projection. Pure (WS-0022 §8).
 *
 * Time axes (WS-0024 F3/F6):
 * - **recorded time** is the store's `recordedSeq`; `asOf: t` keeps only observations recorded at or before `t`, so an
 *   answer given at `t` is reproducible after later observations;
 * - **valid time** is the source's own `dateModified`; "latest" means latest by the source's clock, and arrival order
 *   only breaks an exact tie, so a late-arriving older observation never overrides a newer one.
 *
 * Every strategy a falsifier depends on is one field of `Strategies`, so a negative control is `goodStrategies` with
 * exactly one field swapped (the WS-0024 `impl` map pattern).
 */

export interface ViewOptions {
  /** Recorded-time as-of: only observations with `recordedSeq <= asOf`. Absent means now. */
  readonly asOf?: number;
  /** Valid-time as-of (epoch ms): only observations the source dated at or before this instant. Absent means now. */
  readonly validAt?: number;
  /** The workload query interval; absent means [0.4, 0.6], the TB-01 example. */
  readonly query?: FteInterval;
}

export interface Strategies {
  /** Ascending order of one occurrence's observations; the last is the latest. */
  readonly order: (a: ListingObservation, b: ListingObservation) => number;
  readonly statusOf: (ordered: ReadonlyArray<ListingObservation>) => string;
  readonly deriveWorkload: (observation: ListingObservation) => WorkloadFact;
  readonly classify: (query: FteInterval, fact: WorkloadFact) => WorkloadClass;
  readonly asOf: (
    observations: ReadonlyArray<ListingObservation>,
    asOf: number | undefined,
  ) => ReadonlyArray<ListingObservation>;
}

const epochOf = (iso: string | undefined): number => {
  const parsed = iso === undefined ? Number.NaN : Date.parse(iso);
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
};

const compareIds = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** By the source's clock; recorded order breaks an exact tie (a declared rule: WS-0024 finding 2). */
export const byValidTime = (a: ListingObservation, b: ListingObservation): number =>
  epochOf(a.content.dateModified) - epochOf(b.content.dateModified) ||
  a.recorded.recordedSeq - b.recorded.recordedSeq ||
  compareIds(a.id, b.id);

export const byRecordedTime = (a: ListingObservation, b: ListingObservation): number =>
  a.recorded.recordedSeq - b.recorded.recordedSeq || compareIds(a.id, b.id);

export const latestStatus = (ordered: ReadonlyArray<ListingObservation>): string =>
  ordered[ordered.length - 1]?.content.status ?? "UNKNOWN";

export const goodStrategies: Strategies = {
  order: byValidTime,
  statusOf: latestStatus,
  deriveWorkload: (observation) => deriveWorkload(observation.content).fact,
  classify,
  asOf: (observations, asOf) =>
    asOf === undefined ? observations : observations.filter((o) => o.recorded.recordedSeq <= asOf),
};

export const DEFAULT_QUERY: FteInterval = { minValue: 0.4, maxValue: 0.6 };

export const occurrenceKey = (source: string, externalId: string): string =>
  `${source}|${externalId}`;

export interface OccurrenceView {
  readonly key: string;
  readonly source: string;
  readonly externalId: string;
  readonly status: string;
  readonly active: boolean;
  readonly url: string | undefined;
  readonly title: string | undefined;
  readonly observationIds: ReadonlyArray<string>;
  readonly workload: WorkloadFact;
  readonly workloadClass: WorkloadClass;
}

/**
 * The latest observation (by `order`) whose workload is not `TempUnknown`; `TempUnknown` only when nothing else
 * exists. A later feed summary therefore never erases what an earlier detail established.
 */
const selectWorkload = (
  ordered: ReadonlyArray<ListingObservation>,
  strategies: Strategies,
): WorkloadFact => {
  const facts = ordered.map(strategies.deriveWorkload).toReversed();
  return (
    facts.find((f) => f.state !== "TempUnknown") ??
    facts[0] ?? { state: "Unknown", evidence: ["no observation"], method: WORKLOAD_METHOD }
  );
};

/** Latest determined value of a simple attribute by valid time (the first source of truth for `url`/`title`). */
const latestValue = (
  ordered: ReadonlyArray<ListingObservation>,
  pick: (o: ListingObservation) => string | undefined,
): string | undefined => ordered.map(pick).findLast((v) => v !== undefined);

const groupByOccurrence = (
  observations: ReadonlyArray<ListingObservation>,
): ReadonlyMap<string, ReadonlyArray<ListingObservation>> =>
  Map.groupBy(new Map(observations.map((o) => [o.id, o] as const)).values(), (o) =>
    occurrenceKey(o.content.source, o.content.externalId),
  );

/** Every occurrence the observations name, as of the requested times, sorted by key. */
export const occurrenceViews = (
  observations: ReadonlyArray<ListingObservation>,
  options: ViewOptions = {},
  strategies: Strategies = goodStrategies,
): ReadonlyArray<OccurrenceView> => {
  const recorded = strategies.asOf(observations, options.asOf);
  const valid =
    options.validAt === undefined
      ? recorded
      : recorded.filter((o) => epochOf(o.content.dateModified) <= (options.validAt as number));
  const query = options.query ?? DEFAULT_QUERY;
  return [...groupByOccurrence(valid).entries()]
    .toSorted(([a], [b]) => compareIds(a, b))
    .map(([key, group]) => {
      const ordered = group.toSorted(strategies.order);
      const status = strategies.statusOf(ordered);
      const workload = selectWorkload(ordered, strategies);
      const first = ordered[0] as ListingObservation;
      return {
        key,
        source: first.content.source,
        externalId: first.content.externalId,
        status,
        active: status === "ACTIVE",
        url: latestValue(ordered, (o) => o.content.facts.url.value),
        title: latestValue(ordered, (o) => o.content.facts.title.value),
        observationIds: ordered.map((o) => o.id).toSorted(),
        workload,
        workloadClass: strategies.classify(query, workload),
      };
    });
};

/** One row of the rebuildable `workload_projection` table: a vacancy's fused workload. */
export interface WorkloadRow {
  readonly canonicalJobId: string;
  readonly workloadState: FactState;
  readonly workloadMin: number | null;
  readonly workloadMax: number | null;
  readonly workloadMethod: string;
}

/** Which vacancy each occurrence belongs to (today: the corpus's `occurrences.canonicalJobId`; TB-02 replaces it). */
export type Membership = ReadonlyMap<string, string>;

const rowOf = (canonicalJobId: string, fact: WorkloadFact): WorkloadRow => ({
  canonicalJobId,
  workloadState: fact.state,
  workloadMin: fact.value?.minValue ?? null,
  workloadMax: fact.value?.maxValue ?? null,
  workloadMethod: fact.method,
});

/** The workload rows for exactly `jobIds`, from every observation of their member occurrences. */
export const projectJobs = (
  jobIds: ReadonlyArray<string>,
  observations: ReadonlyArray<ListingObservation>,
  membership: Membership,
  strategies: Strategies = goodStrategies,
): ReadonlyArray<WorkloadRow> => {
  const wanted = new Set(jobIds);
  const views = occurrenceViews(
    observations.filter((o) =>
      wanted.has(membership.get(occurrenceKey(o.content.source, o.content.externalId)) ?? ""),
    ),
    {},
    strategies,
  );
  return [...wanted]
    .toSorted(compareIds)
    .map((jobId) =>
      rowOf(
        jobId,
        fuse(views.filter((v) => membership.get(v.key) === jobId).map((v) => v.workload)),
      ),
    );
};

/** Full rebuild: every vacancy any observation reaches through `membership`. */
export const rebuild = (
  observations: ReadonlyArray<ListingObservation>,
  membership: Membership,
): ReadonlyArray<WorkloadRow> => {
  const jobs = new Set(
    observations.flatMap((o) => {
      const job = membership.get(occurrenceKey(o.content.source, o.content.externalId));
      return job === undefined ? [] : [job];
    }),
  );
  return projectJobs([...jobs], observations, membership);
};

/** The vacancies a batch of new observations touches: the only rows an incremental refresh recomputes. */
export const touchedJobs = (
  batch: ReadonlyArray<ListingObservation>,
  membership: Membership,
): ReadonlyArray<string> => [
  ...new Set(
    batch.flatMap((o) => {
      const job = membership.get(occurrenceKey(o.content.source, o.content.externalId));
      return job === undefined ? [] : [job];
    }),
  ),
];

/**
 * Incremental maintenance: after a batch is stored, recompute only the touched vacancies and replace their rows.
 * The law (`Projection.test.ts`) is that folding this over any batching equals `rebuild` of the union.
 */
export const applyBatch = (
  rows: ReadonlyMap<string, WorkloadRow>,
  stored: ReadonlyArray<ListingObservation>,
  batch: ReadonlyArray<ListingObservation>,
  membership: Membership,
): ReadonlyMap<string, WorkloadRow> =>
  new Map([
    ...rows,
    ...projectJobs(touchedJobs(batch, membership), stored, membership).map(
      (row) => [row.canonicalJobId, row] as const,
    ),
  ]);
