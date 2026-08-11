import { describe, expect, it } from "vitest";
import * as DateTime from "effect/DateTime";
import * as Option from "effect/Option";
import { ApplicationRecord, SavedJob, historyToJson, historyToMarkdown } from "./Applications.ts";
import type { JobSnapshot } from "./Job.ts";

const now = DateTime.nowUnsafe();

const snapshot: JobSnapshot = {
  title: "Baker",
  employerName: "Bakery AS",
  location: "Oslo",
  description: "Bakes bread every morning, weekends included.",
  applicationUrl: "https://jobs.example.invalid/1",
  publishedAt: "2026-01-01T00:00:00Z",
  deadline: "2026-02-01T00:00:00Z",
};

const savedJob = new SavedJob({
  id: "sj_1" as never,
  profileId: "profile_1" as never,
  canonicalJobId: "cj_1" as never,
  jobSnapshot: snapshot,
  note: "Sounds like a good fit.",
  createdAt: now,
  updatedAt: now,
});

const applicationRecord = new ApplicationRecord({
  id: "app_1" as never,
  profileId: "profile_1" as never,
  savedJobId: "sj_1" as never,
  canonicalJobId: "cj_1" as never,
  jobSnapshot: snapshot,
  method: "assisted",
  status: "submitted",
  applicationUrl: snapshot.applicationUrl,
  cv: "CV BODY",
  letter: "LETTER BODY",
  generator: "template",
  downgradeReason: Option.some("webcruiter: AssistedOnly"),
  notes: "Rescheduled once.",
  createdAt: now,
  updatedAt: now,
});

describe("historyToJson", () => {
  it("carries every field of every saved job and application, not a summary", () => {
    const parsed = JSON.parse(historyToJson([savedJob], [applicationRecord]));
    expect(parsed.savedJobs).toHaveLength(1);
    expect(parsed.savedJobs[0]).toMatchObject({
      id: "sj_1",
      canonicalJobId: "cj_1",
      note: "Sounds like a good fit.",
      jobSnapshot: snapshot,
    });
    expect(parsed.applications).toHaveLength(1);
    expect(parsed.applications[0]).toMatchObject({
      id: "app_1",
      status: "submitted",
      method: "assisted",
      cv: "CV BODY",
      letter: "LETTER BODY",
      downgradeReason: "webcruiter: AssistedOnly",
      jobSnapshot: snapshot,
    });
  });

  it("renders empty arrays for a person with no history, not an omitted key", () => {
    expect(JSON.parse(historyToJson([], []))).toEqual({ savedJobs: [], applications: [] });
  });
});

describe("historyToMarkdown", () => {
  it("omits both sections for a person with no history", () => {
    expect(historyToMarkdown([], [])).toBe("");
  });

  it("renders a saved job's snapshot, not the corpus's current view of it", () => {
    const md = historyToMarkdown([savedJob], []);
    expect(md).toContain("## Saved jobs");
    expect(md).toContain("### Baker — Bakery AS");
    expect(md).toContain("Oslo");
    expect(md).toContain(snapshot.applicationUrl);
    expect(md).toContain("Deadline 2026-02-01T00:00:00Z");
    expect(md).toContain("Sounds like a good fit.");
    expect(md).not.toContain("## Applications");
  });

  it("renders an application's status, method, downgrade reason, and the full CV and letter", () => {
    const md = historyToMarkdown([], [applicationRecord]);
    expect(md).toContain("## Applications");
    expect(md).toContain("Status: submitted (assisted)");
    expect(md).toContain("Downgraded from automated: webcruiter: AssistedOnly");
    expect(md).toContain("Rescheduled once.");
    expect(md).toContain("CV BODY");
    expect(md).toContain("LETTER BODY");
    expect(md).not.toContain("## Saved jobs");
  });
});
