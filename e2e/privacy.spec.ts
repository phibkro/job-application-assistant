import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

const DEMO_TOKEN = "demo-token";
const evidencePath = (name: string): string => `.artifacts/ws-0019/${name}`;

const CONSENT_DESCRIPTION =
  "When enabled, model-powered features (document drafting with the Model engine, and document " +
  "import with Model extraction) send your content to Cloudflare Workers AI for processing under " +
  "Cloudflare's processor terms. Drafting sends fact keys, not your actual profile values; import " +
  "sends the document you submit. Responses are processed in your account. When disabled, these " +
  "features run without any model service.";

const assertAccessible = async (page: Page): Promise<void> => {
  const result = await new AxeBuilder({ page }).analyze();
  expect(result.violations).toEqual([]);
};

const signIn = async (page: Page): Promise<void> => {
  await page.getByLabel("Session token or API key").fill(DEMO_TOKEN);
  await page.getByRole("button", { name: "Use token" }).click();
  await expect(page.getByText("Signed in.")).toBeVisible();
};

test("shows visible consent disclosure, distinct privacy card, export, and signed-out deletion notice", async ({
  page,
  request,
}) => {
  const headers = {
    Authorization: `Bearer ${DEMO_TOKEN}`,
    "Content-Type": "application/json",
  };
  const reset = await request.put("/api/v1/me/privacy/ai-consent", {
    headers,
    data: { enabled: false },
  });
  expect(reset.status()).toBe(200);

  await page.goto("/");
  await signIn(page);
  await page.getByRole("link", { name: "Profile" }).click();
  await expect(page.getByRole("heading", { name: "Profile" })).toBeVisible();

  const consent = page.getByLabel("Enable AI processing of my data");
  const disclosure = page.getByText(CONSENT_DESCRIPTION, { exact: true });
  await expect(disclosure).toBeVisible();
  const describedBy = await consent.getAttribute("aria-describedby");
  expect(describedBy).not.toBeNull();
  expect(await disclosure.getAttribute("id")).toBe(describedBy);
  await expect(consent).not.toBeChecked();
  await page.screenshot({ path: evidencePath("privacy-consent-off.png"), fullPage: true });
  await assertAccessible(page);

  const enabled = page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      new URL(response.url()).pathname === "/api/v1/me/privacy/ai-consent" &&
      response.ok(),
  );
  await consent.click();
  await enabled;
  await expect(consent).toBeChecked();
  await page.reload();
  await expect(page.getByLabel("Enable AI processing of my data")).toBeChecked();
  await page.screenshot({ path: evidencePath("privacy-consent-on.png"), fullPage: true });
  await assertAccessible(page);

  const disabled = page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      new URL(response.url()).pathname === "/api/v1/me/privacy/ai-consent" &&
      response.ok(),
  );
  await page.getByLabel("Enable AI processing of my data").click();
  await disabled;
  await expect(page.getByLabel("Enable AI processing of my data")).not.toBeChecked();

  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download workspace export (JSON)" }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toMatch(/^workspace-export-\d{4}-\d{2}-\d{2}\.json$/);
  const downloadedPath = evidencePath("workspace-export.json");
  await download.saveAs(downloadedPath);
  const exported = JSON.parse(await readFile(downloadedPath, "utf8"));
  expect(exported.schema).toBe("job-index.workspace-export");
  expect(exported.version).toBe(1);
  expect(exported.data).toBeTruthy();
  expect(typeof exported.data).toBe("object");
  expect(Object.keys(exported.data).toSorted()).toEqual(
    [
      "profile",
      "answers",
      "savedJobs",
      "applications",
      "applicationEvents",
      "documents",
      "proposals",
      "labels",
      "labelAssignments",
    ].toSorted(),
  );
  await page.screenshot({ path: evidencePath("privacy-export-download.png"), fullPage: true });

  await page.getByRole("button", { name: "Delete account…" }).click();
  await expect(page.getByText(/revokes your access immediately/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Permanently delete account" })).toBeDisabled();
  await page.screenshot({ path: evidencePath("privacy-delete-confirm.png"), fullPage: true });
  await assertAccessible(page);
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("button", { name: "Delete account…" })).toBeVisible();
  await expect(page.getByText("Signed in.")).toBeVisible();

  await page.getByRole("link", { name: "Studio" }).click();
  await expect(page.getByRole("heading", { name: "Studio" })).toBeVisible();
  await page.getByLabel("Engine").selectOption("model");
  await page.getByLabel("Document kind").selectOption("cv");
  await page.getByRole("button", { name: "Generate CV" }).click();
  const consentCard = page.getByRole("status").filter({
    hasText: "AI processing is disabled in your privacy settings.",
  });
  await expect(consentCard).toBeVisible({ timeout: 10_000 });
  await expect(consentCard.getByRole("link", { name: "Review privacy settings" })).toHaveAttribute(
    "href",
    "/profile#privacy",
  );
  await expect(consentCard).not.toContainText(/upgrade|Premium required|model-drafting/i);
  await page.screenshot({
    path: evidencePath("privacy-consent-required-card.png"),
    fullPage: true,
  });
  await assertAccessible(page);

  // Confirm the root-owned signed-out notice without mutating the durable
  // demo account used by the remaining browser journeys.
  await page.route("**/api/v1/me/account", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ erased: true, at: "2026-08-26T12:00:00.000Z" }),
    }),
  );
  await consentCard.getByRole("link", { name: "Review privacy settings" }).click();
  await page.getByRole("button", { name: "Delete account…" }).click();
  await page
    .getByLabel(
      "I understand this permanently deletes my profile, answers, saved jobs, applications, documents, and history, and cannot be undone",
    )
    .click();
  await page.getByRole("button", { name: "Permanently delete account" }).click();
  const deletionNotice = page.getByRole("status").filter({
    hasText: "Your account has been deleted.",
  });
  await expect(deletionNotice).toBeVisible();
  await expect(page.getByText("Signed in.")).not.toBeVisible();
  await expect(page.getByLabel("Session token or API key")).toBeVisible();
  await page.screenshot({
    path: evidencePath("privacy-account-deleted-notice.png"),
    fullPage: true,
  });
  await assertAccessible(page);
  await deletionNotice.getByRole("button", { name: "Dismiss deletion notice" }).click();
  await expect(deletionNotice).not.toBeVisible();
});
