import { describe, expect, it } from "vitest";
import { inertHtml, type Html } from "foldkit/html";
import { checkboxField, consentRequiredCard, upgradeRequiredCard } from "./Shared.ts";

const nodes = (root: Html): Array<NonNullable<Html>> => {
  if (root === null) return [];
  return [
    root,
    ...(root.children ?? []).flatMap((child) => (typeof child === "string" ? [] : nodes(child))),
  ];
};

describe("checkboxField", () => {
  it("renders one visible description node and points aria-describedby to it", () => {
    const description = "The complete consent disclosure.";
    const rendered = checkboxField(
      {
        id: "consent",
        label: "Consent",
        isChecked: false,
        description,
        onToggle: () => undefined as never,
        descriptionClassName: "visible-description",
      },
      inertHtml,
    );
    const renderedNodes = nodes(rendered);
    const checkbox = renderedNodes.find((node) => node.data?.attrs?.role === "checkbox");
    const descriptionNode = renderedNodes.find(
      (node) => node.data?.props?.id === "consent-description",
    );

    expect(checkbox?.data?.attrs?.["aria-describedby"]).toBe("consent-description");
    expect(descriptionNode?.data?.class?.["visible-description"]).toBe(true);
    expect(descriptionNode?.sel).toBe("span");
    expect(descriptionNode?.children).toHaveLength(1);
    expect(descriptionNode?.children?.[0]).toMatchObject({ text: description });
    expect(
      renderedNodes.filter((node) => node.data?.props?.id === "consent-description"),
    ).toHaveLength(1);
  });
});

describe("privacy and upgrade problem cards", () => {
  it("links consent refusal to privacy settings with its distinct explanation", () => {
    const card = consentRequiredCard("Enable AI processing before using the Model engine.");
    expect(card).toEqual({
      title: "AI processing is disabled in your privacy settings.",
      detail: "Enable AI processing before using the Model engine.",
      href: "/profile#privacy",
      action: "Review privacy settings",
    });
    expect(card.title).not.toContain("capability");
  });

  it("keeps a capability refusal separate from the privacy-settings card", () => {
    const card = upgradeRequiredCard("model-drafting");
    expect(card.title).toBe('This needs the "model-drafting" capability.');
    expect(card.detail).toContain("current plan");
    expect(card).not.toHaveProperty("href");
  });
});
