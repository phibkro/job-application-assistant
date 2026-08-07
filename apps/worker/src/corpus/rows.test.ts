import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import type { CanonicalJob } from "@job-index/domain/Job";
import type { CanonicalJobId, SourceId } from "@job-index/domain/Ids";
import {
  canonicalJobFromRow,
  occurrenceFromRow,
  rowFromCanonicalJob,
  rowFromOccurrence,
  type OccurrenceRecord,
} from "./rows.ts";

const canonicalJobArb: fc.Arbitrary<CanonicalJob> = fc.record({
  id: fc.string({ minLength: 1 }).map((s) => s as CanonicalJobId),
  title: fc.string(),
  employerName: fc.string(),
  location: fc.string(),
  description: fc.string(),
  applicationUrl: fc.webUrl(),
  publishedAt: fc.constant("2026-01-01T00:00:00Z"),
  deadline: fc.option(fc.string(), { nil: undefined }),
  status: fc.oneof(
    fc.constant({ _tag: "Active" as const }),
    fc.string().map((closedAt) => ({ _tag: "Closed" as const, closedAt })),
  ),
  sequence: fc.integer({ min: 1, max: 1_000_000 }).map((n) => n as CanonicalJob["sequence"]),
  changedAt: fc.constant("2026-01-01T00:00:00Z"),
  sources: fc.array(fc.string()).map((xs) => xs as unknown as ReadonlyArray<SourceId>),
});

describe("canonical job row round trip", () => {
  it("decode(encode(job)) reproduces the job", () => {
    fc.assert(
      fc.property(canonicalJobArb, fc.string(), (job, canonicalKey) => {
        const roundTripped = canonicalJobFromRow(rowFromCanonicalJob(job, canonicalKey));
        expect(roundTripped).toEqual(job);
      }),
    );
  });

  it("a deadline of undefined round-trips as undefined, not null or the empty string", () => {
    const job: CanonicalJob = {
      id: "cj_1" as CanonicalJobId,
      title: "Baker",
      employerName: "Bakery AS",
      location: "Oslo",
      description: "Bakes bread.",
      applicationUrl: "https://example.com/1",
      publishedAt: "2026-01-01T00:00:00Z",
      status: { _tag: "Active" },
      sequence: 1 as CanonicalJob["sequence"],
      changedAt: "2026-01-01T00:00:00Z",
      sources: [],
    };
    expect(canonicalJobFromRow(rowFromCanonicalJob(job, "key")).deadline).toBeUndefined();
  });
});

const occurrenceArb: fc.Arbitrary<OccurrenceRecord> = fc.record({
  id: fc.string({ minLength: 1 }).map((s) => s as OccurrenceRecord["id"]),
  canonicalJobId: fc.string({ minLength: 1 }).map((s) => s as CanonicalJobId),
  sourceId: fc.string({ minLength: 1 }).map((s) => s as SourceId),
  externalId: fc.string(),
  contentFingerprint: fc.string(),
  firstSeenAt: fc.string(),
  lastSeenAt: fc.string(),
});

describe("occurrence row round trip", () => {
  it("decode(encode(record)) reproduces the record", () => {
    fc.assert(
      fc.property(occurrenceArb, (record) => {
        expect(occurrenceFromRow(rowFromOccurrence(record))).toEqual(record);
      }),
    );
  });
});
