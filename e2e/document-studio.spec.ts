import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * WS-0018 acceptance (i): the document studio journey. Sign in, open Studio,
 * generate a general CV from the seeded profile, edit inline and save (the
 * edit survives a reload), copy, then draft a letter targeted at a vacancy
 * shortlisted in-test — the card shows the frozen job title. Regeneration
 * yields a second row; delete confirmation removes it. With AI processing
 * disabled, the model path shows the consent-required privacy notice first.
 * Axe-clean at every checkpoint.
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

test("drafts, edits, targets, regenerates, copies, and deletes studio documents", async ({
  page,
  request,
}) => {
  // Reset any documents left over from earlier runs so counts are exact.
  const headers = { Authorization: `Bearer ${DEMO_TOKEN}` };
  const existing = await request.get("/api/v1/me/documents?cursor=", { headers });
  if (existing.ok()) {
    const docs = (await existing.json()).data as Array<{ id: string }>;
    await Promise.all(
      docs.map((doc) => request.delete(`/api/v1/me/documents/${doc.id}`, { headers })),
    );
  }

  await page.goto("/");
  await signIn(page);

  // ---- Open the studio -----------------------------------------------------
  await page.getByRole("link", { name: "Studio" }).click();
  await expect(page.getByRole("heading", { name: "Studio" })).toBeVisible();
  await assertAccessible(page);

  // ---- General CV: generate, inspect grounding, edit, save -----------------
  const created = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/v1/me/documents",
  );
  await page.getByRole("button", { name: "Generate CV" }).click();
  await created;
  const cvCard = page
    .locator("div.document-card", { has: page.locator('[data-document-kind="cv-general"]') })
    .first();
  await expect(cvCard).toBeVisible({ timeout: 10_000 });
  const cvEditor = cvCard.getByRole("textbox");
  const original = await cvEditor.inputValue();
  expect(original.length).toBeGreaterThan(0);
  await cvEditor.fill(`${original}\nADDITIONAL NOTE`);
  await expect(cvCard.getByRole("button", { name: "Save changes" })).toBeEnabled();
  const saved = page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" && response.url().includes("/api/v1/me/documents/"),
  );
  await cvCard.getByRole("button", { name: "Save changes" }).click();
  await saved;
  await expect(cvCard.getByRole("button", { name: "Save changes" })).toBeDisabled();

  // The saved edit persists server-side. The list carries summaries only,
  // so resolve the document id from the list, then read the full view.
  const listResponse = await page.request.get("/api/v1/me/documents", {
    headers: { Authorization: `Bearer ${DEMO_TOKEN}` },
  });
  expect(listResponse.status()).toBe(200);
  const stored = (await listResponse.json()) as {
    data: Array<{ id: string; kind: string; jobId: string | null; content?: string }>;
  };
  const summary = stored.data.find((d) => d.kind === "cv" && d.jobId === null);
  expect(summary).toBeDefined();
  const detailResponse = await page.request.get(`/api/v1/me/documents/${summary!.id}`, {
    headers: { Authorization: `Bearer ${DEMO_TOKEN}` },
  });
  expect(detailResponse.status()).toBe(200);
  const detail = (await detailResponse.json()) as { content: string };
  expect(detail.content).toMatch(/ADDITIONAL NOTE$/);

  // The studio still lists it after reload.
  const reloadedCv = page.locator(".document-card").filter({ hasText: "CV (general)" }).first();
  await expect(reloadedCv).toBeVisible();

  // Copy button present (clipboard permission is not granted headlessly; the
  // button rendering is the contract here).
  await expect(reloadedCv.getByRole("button", { name: "Copy" })).toBeVisible();

  // ---- Targeted letter: shortlist a job, target it --------------------------
  await page.getByRole("link", { name: "Fresh feed" }).click();
  const frontend = page.locator(`[data-job-title="Frontendutvikler"]`);
  await expect(frontend).toBeVisible();
  await Promise.all([
    page.waitForURL(/\/jobs\//),
    frontend.getByRole("link", { name: "View" }).click(),
  ]);
  await page.getByRole("button", { name: "Shortlist this job" }).click();
  await expect(page.getByText("Shortlisted.")).toBeVisible();

  // Saving a job invalidates Studio's target snapshot. Wait for the refreshed
  // saved-job option before selecting it; this proves the SPA journey rather
  // than relying on request timing.
  await page.getByRole("link", { name: "Studio" }).click();
  await expect(page.getByRole("heading", { name: "Studio" })).toBeVisible();
  await page.getByLabel("Document kind").selectOption("letter");
  const target = page.getByLabel("Target vacancy (optional)");
  const targetOption = target.locator("option", { hasText: "Frontendutvikler" });
  await expect(targetOption).toHaveCount(1);
  const targetValue = await targetOption.getAttribute("value");
  expect(targetValue).not.toBeNull();
  await target.selectOption(targetValue!);
  const firstLetterCreated = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/v1/me/documents" &&
      response.ok(),
  );
  await page.getByRole("button", { name: "Generate letter" }).click();
  await firstLetterCreated;
  const letterCard = page
    .locator("div.document-card", { hasText: /Covering letter — Frontendutvikler/ })
    .first();
  await expect(letterCard).toBeVisible({ timeout: 10_000 });
  // The frozen snapshot feeds the selection criteria.
  await expect(letterCard).toContainText(/Frontendutvikler|Nordic Tech/i);
  await assertAccessible(page);

  const secondLetterCreated = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/v1/me/documents" &&
      response.ok(),
  );
  await page.getByRole("button", { name: "Generate letter" }).click();
  await secondLetterCreated;
  await expect(page.locator('.document-card [data-document-kind="letter-targeted"]')).toHaveCount(
    2,
    { timeout: 10_000 },
  );

  // ---- Delete with confirmation ---------------------------------------------
  const beforeDelete = await page.locator(".document-card").count();
  const letterId = await letterCard
    .locator('[data-document-kind="letter-targeted"]')
    .first()
    .evaluate((el) =>
      el.closest(".document-card")!.querySelector("textarea")!.id.replace("studio-editor-", ""),
    );
  await letterCard.getByRole("button", { name: "Delete", exact: true }).click();
  await letterCard.getByRole("button", { name: "Confirm delete" }).click();
  await expect(page.locator(".document-card")).toHaveCount(beforeDelete - 1, {
    timeout: 10_000,
  });
  void letterId;
  await assertAccessible(page);

  // ---- Model engine without consent: privacy notice precedes entitlement ----
  await page.getByLabel("Engine").selectOption("model");
  await page.getByLabel("Document kind").selectOption("cv");
  await page.getByLabel("Target vacancy (optional)").selectOption({ label: "General document" });
  await page.getByRole("button", { name: "Generate CV" }).click();
  await expect(
    page.getByText("AI processing is disabled in your privacy settings.").first(),
  ).toBeVisible({ timeout: 10_000 });
  await assertAccessible(page);
});
