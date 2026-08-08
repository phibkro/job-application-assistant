import { describe, expect, it } from "vitest";
import { snapshotOf } from "./Job.ts";
import type { HydratedCanonicalJob } from "./Job.ts";

const job: HydratedCanonicalJob = {
  id: "cj_1" as never,
  title: "Baker",
  employerName: "Bakery AS",
  location: "Oslo",
  applicationUrl: "https://jobs.example.invalid/1",
  publishedAt: "2026-01-01T00:00:00Z",
  status: { _tag: "Active" },
  sequence: 1 as never,
  changedAt: "2026-01-01T00:00:00Z",
  sources: [],
  hydration: {
    _tag: "Hydrated",
    description: "Bakes bread every morning.",
    deadline: "2026-02-01T00:00:00Z",
  },
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
    const withoutDeadline: HydratedCanonicalJob = {
      ...job,
      hydration: { _tag: "Hydrated", description: job.hydration.description },
    };
    expect(snapshotOf(withoutDeadline).deadline).toBeUndefined();
  });
});
