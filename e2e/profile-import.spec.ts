import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * WS-0016 acceptance (i): paste a CV → proposals appear each with an
 * inferred badge and evidence quote → edit one and accept it → accept a
 * second → discard the rest → reload shows merged values; discarded ones
 * never come back. Axe-clean at every checkpoint.
 */

const DEMO_TOKEN = "demo-token";

const assertAccessible = async (page: Page): Promise<void> => {
  const result = await new AxeBuilder({ page }).analyze();
  expect(result.violations).toEqual([]);
};

const signIn = async (page: Page): Promise<void> => {
  const token = page.getByLabel("Session token or API key");
  await token.waitFor({ state: "visible", timeout: 1_000 }).catch(() => undefined);
  if (await token.isVisible()) {
    await token.fill(DEMO_TOKEN);
    await page.getByRole("button", { name: "Use token" }).click();
    await expect(page.getByText("Signed in.")).toBeVisible();
  }
};

const PASTED_CV = `Kari Nordmann
Senior Baker

SUMMARY
Baker of ten years specialising in sourdough.

Location: Oslo

EXPERIENCE
Senior Baker - Bakery AS
2018 - present
- Runs the sourdough programme

SKILLS
Sourdough, Laminated pastry, Team leadership

EDUCATION
Bachelor i informatikk, Universitetet i Bergen`;

test("imports a pasted document, reviews proposals per field, and merges accepted values", async ({
  page,
}) => {
  await page.goto("/");
  await signIn(page);

  await page.getByRole("link", { name: "Profile" }).click();
  await expect(page.getByRole("heading", { name: "Profile" })).toBeVisible();
  await assertAccessible(page);
  await expect(page.locator('input[type="file"]')).toHaveAttribute(
    "accept",
    ".pdf,.txt,application/pdf,text/plain",
  );

  await page.getByLabel("Pasted document text").fill(PASTED_CV);
  const imported = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/v1/me/profile/proposals") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Import proposals" }).click();
  expect((await imported).status()).toBe(200);

  const queue = page.getByRole("region", { name: "Proposed facts" });
  const cards = queue.locator("article");
  await expect(queue.getByRole("heading", { name: "Proposed facts" })).toBeVisible();
  await expect(cards.first()).toBeVisible();
  const importedCount = await cards.count();
  await Promise.all(
    Array.from({ length: importedCount }, (_, index) =>
      Promise.all([
        expect(cards.nth(index).getByText("Inferred", { exact: true })).toBeVisible(),
        expect(cards.nth(index).locator("blockquote")).not.toBeEmpty(),
      ]),
    ),
  );
  await assertAccessible(page);
  await expect(
    page.getByRole("textbox", { name: /structured JSON\)$/ }).first(),
  ).toBeVisible();

  const decide = async (card: Locator, decision: "Accept" | "Discard"): Promise<void> => {
    const before = await cards.count();
    const response = page.waitForResponse(
      (candidate) =>
        candidate.url().includes("/api/v1/me/profile/proposals/") &&
        candidate.url().endsWith("/decision"),
    );
    await card.getByRole("button", { name: new RegExp(`^${decision} proposed`) }).click();
    expect((await response).status()).toBe(200);
    await expect(cards).toHaveCount(before - 1);
  };

  const headlineEditor = page.getByRole("textbox", { name: "Proposed headline", exact: true });
  await expect(headlineEditor).not.toHaveValue(/^".*"$/);
  await headlineEditor.fill("Head Baker (edited)");
  const headline = headlineEditor.locator("xpath=ancestor::article");
  const nextEditorId = await headline.evaluate((article) => {
    const next = article.nextElementSibling;
    return next?.querySelector("input, textarea")?.id ?? null;
  });
  const beforeHeadlineDecision = await cards.count();
  const headlineDecision = page.waitForResponse(
    (candidate) =>
      candidate.url().includes("/api/v1/me/profile/proposals/") &&
      candidate.url().endsWith("/decision"),
  );
  const acceptHeadline = headline.getByRole("button", { name: "Accept proposed headline" });
  await acceptHeadline.focus();
  await page.keyboard.press("Enter");
  expect((await headlineDecision).status()).toBe(200);
  await expect(cards).toHaveCount(beforeHeadlineDecision - 1);
  await expect(
    page.getByRole("status").filter({ hasText: "Accepted proposal for headline." }),
  ).toContainText("proposal");
  if (nextEditorId === null) {
    await expect(queue.getByRole("heading", { name: "Proposed facts" })).toBeFocused();
  } else {
    await expect(page.locator(`#${nextEditorId}`)).toBeFocused();
  }

  const skillEditor = page.getByRole("textbox", { name: "Proposed skill", exact: true }).first();
  await expect(skillEditor).not.toHaveValue(/^".*"$/);
  const skill = skillEditor.locator("xpath=ancestor::article");
  await decide(skill, "Accept");

  const discardRemaining = async (): Promise<void> => {
    if ((await cards.count()) === 0) return;
    await decide(cards.first(), "Discard");
    await discardRemaining();
  };
  await discardRemaining();
  await expect(queue.getByText("No proposed facts are waiting for review.")).toBeVisible();
  await assertAccessible(page);

  await page.reload();
  await signIn(page);
  await page.getByRole("link", { name: "Profile" }).click();
  await expect(page.getByRole("heading", { name: "Profile" })).toBeVisible();
  await expect(page.getByText("No proposed facts are waiting for review.")).toBeVisible();
  await expect(page.getByLabel("Headline")).toHaveValue("Head Baker (edited)");
  await expect(page.getByLabel("Skills, one per line")).toHaveValue(/Sourdough/);

  const me = await page.request.get("/api/v1/me", {
    headers: { Authorization: `Bearer ${DEMO_TOKEN}` },
  });
  expect(me.status()).toBe(200);
  const meBody = await me.json();
  expect(meBody.profile.headline).toBe("Head Baker (edited)");
  expect(meBody.profile.skills).toContain("Sourdough");

  const pending = await page.request.get("/api/v1/me/profile/proposals", {
    headers: { Authorization: `Bearer ${DEMO_TOKEN}` },
  });
  expect(pending.status()).toBe(200);
  expect((await pending.json()).data).toEqual([]);
  await assertAccessible(page);
});
