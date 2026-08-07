import * as Option from "effect/Option";
import type { ApplyRecord } from "./Model.ts";
import { RequestIdle } from "./Model.ts";

/** Finds the apply-flow record for one job, if `update` has touched it yet. */
export const find = (
  records: ReadonlyArray<ApplyRecord>,
  jobId: string,
): Option.Option<ApplyRecord> =>
  Option.fromUndefinedOr(records.find((record) => record.jobId === jobId));

/**
 * Replaces the record for `jobId`, inserting a fresh one (`stage: none`,
 * `pending: Idle`) the first time a job is touched. Every apply-flow
 * transition goes through this, so "no record yet" and "a record with
 * nothing in it" are never two different representations of the same thing.
 */
export const upsert = (
  records: ReadonlyArray<ApplyRecord>,
  jobId: string,
  transform: (current: ApplyRecord) => ApplyRecord,
): ReadonlyArray<ApplyRecord> => {
  const existing = records.find((record) => record.jobId === jobId);
  const base: ApplyRecord = existing ?? { jobId, stage: Option.none(), pending: RequestIdle() };
  const next = transform(base);
  return existing === undefined
    ? [...records, next]
    : records.map((record) => (record.jobId === jobId ? next : record));
};
