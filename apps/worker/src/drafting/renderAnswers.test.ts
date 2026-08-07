import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import { renderAnswers } from "./renderAnswers.ts";
import { testAnswer, testProfile } from "./fixtures.ts";

describe("renderAnswers", () => {
  it("adds nothing when there are no stored answers", () => {
    const profile = testProfile({ headline: "Customer support specialist" });
    expect(renderAnswers(profile, [])).not.toContain("ADDITIONAL INFORMATION");
  });

  it("projects a stored answer's label and value into the document", () => {
    const profile = testProfile({ headline: "Customer support specialist" });
    const answers = [testAnswer("Notice period", { _tag: "Text" }, "One month")];
    const rendered = renderAnswers(profile, answers);
    expect(rendered).toContain("ADDITIONAL INFORMATION");
    expect(rendered).toContain("Notice period: One month");
  });

  it("translates a Boolean answer to Yes or No rather than printing the raw stored value", () => {
    const profile = testProfile();
    const yes = renderAnswers(profile, [testAnswer("Right to work", { _tag: "Boolean" }, "true")]);
    const no = renderAnswers(profile, [testAnswer("Right to work", { _tag: "Boolean" }, "false")]);
    expect(yes).toContain("Right to work: Yes");
    expect(no).toContain("Right to work: No");
  });

  it("renders every answer shape without throwing", () => {
    const profile = testProfile();
    fc.assert(
      fc.property(
        fc.constantFrom(
          { _tag: "Text" } as const,
          { _tag: "LongText" } as const,
          { _tag: "Number" } as const,
          { _tag: "Boolean" } as const,
          { _tag: "Date" } as const,
          { _tag: "Choice", options: [] } as const,
          { _tag: "File", accepts: [] } as const,
        ),
        fc.string(),
        (shape, value) => {
          expect(() => renderAnswers(profile, [testAnswer("Field", shape, value)])).not.toThrow();
        },
      ),
    );
  });

  it("keeps rendering the profile's own experience order, since there is no advert to rank against", () => {
    const profile = testProfile({
      experience: [
        { title: "Second most recent", employer: "B", period: "2022-2024", highlights: [] },
        { title: "Most recent", employer: "A", period: "2024-2026", highlights: [] },
      ],
    });
    const rendered = renderAnswers(profile, []);
    expect(rendered.indexOf("Second most recent")).toBeLessThan(rendered.indexOf("Most recent"));
  });
});
