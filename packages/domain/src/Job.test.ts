import { describe, expect, it } from "vitest";
import { snapshotOf } from "./Job.ts";
import type { CanonicalJob } from "./Job.ts";

const job: CanonicalJob = {
  id: "cj_1" as never,
  title: "Baker",
  employerName: "Bakery AS",
  location: "Oslo",
  description: "Bakes bread every morning.",
  applicationUrl: "https://jobs.example.invalid/1",
  publishedAt: "2026-01-01T00:00:00Z",
  deadline: "2026-02-01T00:00:00Z",
  status: { _tag: "Active" },
  sequence: 1 as never,
  changedAt: "2026-01-01T00:00:00Z",
  sources: [],
};

describe("snapshotOf", () => {
  it("carries exactly the fields a person needs to recognise the vacancy later, and nothing about the corpus's own bookkeeping", () => {
    expect(snapshotOf(job)).toEqual({
      title: "Baker",
      employerName: "Bakery AS",
      location: "Oslo",
      description: "Bakes bread every morning.",
      applicationUrl: "https://jobs.example.invalid/1",
      publishedAt: "2026-01-01T00:00:00Z",
      deadline: "2026-02-01T00:00:00Z",
    });
  });

  it("carries no deadline forward when the advert never had one — never invents a date", () => {
    const { deadline: _deadline, ...withoutDeadline } = job;
    expect(snapshotOf(withoutDeadline as CanonicalJob).deadline).toBeUndefined();
  });
});
