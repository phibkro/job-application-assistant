import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import type { Experience } from "@job-index/domain/Profile";
import { composeCv } from "./composeCv.ts";
import { testJob, testProfile } from "./fixtures.ts";

const support: Experience = {
  title: "Customer Service Adviser",
  employer: "Nordic Retail AS",
  period: "2022-2026",
  highlights: ["Handled chat and telephone support"],
};

const barista: Experience = {
  title: "Barista",
  employer: "Kaffebrenneriet",
  period: "2019-2022",
  highlights: ["Trained new staff"],
};

describe("composeCv", () => {
  it("leads with the experience most relevant to the advert", () => {
    const job = testJob({
      title: "Customer Service Adviser",
      description: "Answer customer questions through chat and telephone support.",
    });
    const cv = composeCv(testProfile({ experience: [barista, support] }), job);
    expect(cv.indexOf(support.title)).toBeLessThan(cv.indexOf(barista.title));
  });

  it("orders the same profile differently for a different advert", () => {
    const profile = testProfile({ experience: [support, barista] });
    const supportJob = testJob({ title: "Support", description: "chat and telephone support" });
    const baristaJob = testJob({
      title: "Barista wanted",
      description: "trained new staff at a cafe",
    });

    const forSupport = composeCv(profile, supportJob);
    const forBarista = composeCv(profile, baristaJob);

    expect(forSupport.indexOf(support.title)).toBeLessThan(forSupport.indexOf(barista.title));
    expect(forBarista.indexOf(barista.title)).toBeLessThan(forBarista.indexOf(support.title));
  });

  it("is deterministic: the same profile and advert always compose the same document", () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (headline, description) => {
        const profile = testProfile({ headline });
        const job = testJob({ description });
        expect(composeCv(profile, job)).toBe(composeCv(profile, job));
      }),
    );
  });
});
