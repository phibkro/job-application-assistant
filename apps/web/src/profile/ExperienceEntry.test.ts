import * as Option from "effect/Option";
import { describe, expect, it } from "vitest";
import * as ExperienceEntry from "./ExperienceEntry.ts";

/**
 * `ExperienceEntry` is the grandchild Submodel — one array item edited on
 * its own, addressed by `id` rather than the array's index. These tests
 * exercise it against its own tiny Model, the localization the nesting is
 * for: none of them need the profile form or the root Model at all.
 */

const entry: ExperienceEntry.Model = {
  id: "entry-1",
  title: "Engineer",
  employer: "Acme",
  period: "2020-2023",
  highlightsText: "Shipped X\nShipped Y",
};

describe("field edits", () => {
  it("TitleChanged updates only the title and emits nothing to the parent", () => {
    const [model, commands, outMessage] = ExperienceEntry.update(
      entry,
      ExperienceEntry.TitleChanged({ value: "Senior Engineer" }),
    );
    expect(model).toEqual({ ...entry, title: "Senior Engineer" });
    expect(commands).toEqual([]);
    expect(outMessage).toEqual(Option.none());
  });

  it("HighlightsTextChanged keeps the raw newline-separated text, unsplit", () => {
    const [model] = ExperienceEntry.update(
      entry,
      ExperienceEntry.HighlightsTextChanged({ value: "Only one line" }),
    );
    expect(model.highlightsText).toBe("Only one line");
  });
});

describe("RemoveClicked", () => {
  it("does not delete itself — it asks the parent to, via OutMessage", () => {
    const [model, commands, outMessage] = ExperienceEntry.update(
      entry,
      ExperienceEntry.RemoveClicked(),
    );
    expect(model).toBe(entry);
    expect(commands).toEqual([]);
    expect(outMessage).toEqual(Option.some(ExperienceEntry.Removed()));
  });
});

describe("codec", () => {
  it("fromExperience/toExperience round-trip the domain shape through the form's text fields", () => {
    const domainEntry = {
      title: "Engineer",
      employer: "Acme",
      period: "2020-2023",
      highlights: ["Shipped X", "Shipped Y"],
    };
    const form = ExperienceEntry.fromExperience("fresh-id", domainEntry);
    expect(form).toEqual({
      id: "fresh-id",
      title: domainEntry.title,
      employer: domainEntry.employer,
      period: domainEntry.period,
      highlightsText: "Shipped X\nShipped Y",
    });
    expect(ExperienceEntry.toExperience(form)).toEqual(domainEntry);
  });

  it("toExperience drops blank lines from the highlights textarea", () => {
    const form = ExperienceEntry.init();
    const withHighlights = { ...form, highlightsText: "First\n\n  \nSecond" };
    expect(ExperienceEntry.toExperience(withHighlights).highlights).toEqual(["First", "Second"]);
  });

  it("init gives every fresh entry its own id", () => {
    const a = ExperienceEntry.init();
    const b = ExperienceEntry.init();
    expect(a.id).not.toBe(b.id);
  });
});
