import { describe, expect, it } from "vitest";
import type { Experience } from "@job-index/domain/Profile";
import { renderCvBody } from "./sections.ts";
import { testProfile } from "./fixtures.ts";

describe("renderCvBody", () => {
  it("omits a section entirely when the profile has nothing for it", () => {
    const body = renderCvBody(testProfile(), []);
    expect(body).not.toContain("PROFILE");
    expect(body).not.toContain("EXPERIENCE");
    expect(body).not.toContain("SKILLS");
    expect(body).not.toContain("EDUCATION");
    expect(body).not.toContain("LANGUAGES");
  });

  it("prints the fields the profile does have", () => {
    const body = renderCvBody(
      testProfile({
        headline: "Customer support specialist",
        summary: "Ten years in customer-facing roles.",
        skills: ["support", "typescript"],
        education: ["BA, Oslo Metropolitan University"],
        languages: "Norwegian, English",
      }),
      [],
    );
    expect(body).toContain("Customer support specialist");
    expect(body).toContain("PROFILE");
    expect(body).toContain("Ten years in customer-facing roles.");
    expect(body).toContain("SKILLS");
    expect(body).toContain("support, typescript");
    expect(body).toContain("EDUCATION");
    expect(body).toContain("BA, Oslo Metropolitan University");
    expect(body).toContain("LANGUAGES");
    expect(body).toContain("Norwegian, English");
  });

  it("lists experience in the order it is given, title and employer and period, with highlights", () => {
    const entries: ReadonlyArray<Experience> = [
      {
        title: "Customer Service Adviser",
        employer: "Nordic Retail AS",
        period: "2022-2026",
        highlights: ["Handled chat and telephone support"],
      },
    ];
    const body = renderCvBody(testProfile(), entries);
    expect(body).toContain("Customer Service Adviser — Nordic Retail AS (2022-2026)");
    expect(body).toContain("Handled chat and telephone support");
  });
});
