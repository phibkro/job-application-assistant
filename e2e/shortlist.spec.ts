import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

const DEMO_TOKEN = "demo-token";

const assertAccessible = async (page: Page): Promise<void> => {
  const result = await new AxeBuilder({ page }).analyze();
  expect(result.violations).toEqual([]);
};

const signIn = async (page: Page): Promise<void> => {
  await page.getByLabel("Session token or API key").fill(DEMO_TOKEN);
  await page.getByRole("button", { name: "Use token" }).click();
  await expect(page.getByText("Signed in.")).toBeVisible();
};

const jobCard = (page: Page, title: string): Locator =>
  page.locator(`[data-job-title="${title}"]`);

test("edits preferences and uses the explainable shortlist", async ({ page }) => {
  await page.goto("/");
  await signIn(page);

  await page.getByRole("link", { name: "Profile" }).click();
  await expect(page.getByRole("heading", { name: "Profile" })).toBeVisible();
  await page.getByLabel("Desired roles, one per line").fill("Frontend");
  await page.getByLabel("Desired locations, one per line").fill("Bergen");
  await page.getByLabel("Excluded terms, one per line").fill("");
  const profileSaved = page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      new URL(response.url()).pathname === "/api/v1/me/profile" &&
      response.ok(),
  );
  await page.getByRole("button", { name: "Save profile" }).click();
  await profileSaved;
  await expect(page.getByRole("button", { name: "Save profile" })).toBeEnabled();
  await assertAccessible(page);

  await page.getByRole("link", { name: "Fresh feed" }).click();
  await expect(page.getByRole("heading", { name: "Fresh feed" })).toBeVisible();

  const frontend = jobCard(page, "Frontendutvikler");
  const baker = jobCard(page, "Baker i Østfold");
  await expect(frontend).toBeVisible();
  await expect(baker).toBeVisible();
  await expect(frontend).toHaveAttribute("data-fit", /strong|possible/);
  await expect(frontend.getByText(/TypeScript/i)).toBeVisible();
  await expect(frontend).toContainText(/Concerns/i);
  await expect(frontend).toContainText(/location/i);
  const titles = await page.locator("[data-job-title]").evaluateAll((items) =>
    items.map((item) => item.getAttribute("data-job-title")),
  );
  expect(titles).toEqual(expect.arrayContaining(["Frontendutvikler", "Baker i Østfold"]));
  expect(titles.indexOf("Frontendutvikler")).toBeLessThan(titles.indexOf("Baker i Østfold"));
  await assertAccessible(page);

  const fit = await frontend.getAttribute("data-fit");
  const assessmentText = await frontend.locator("[data-match-assessment]").innerText();
  await Promise.all([
    page.waitForURL(/\/jobs\//),
    frontend.getByRole("link", { name: "View" }).click(),
  ]);
  await expect(page.getByRole("heading", { name: "Frontendutvikler", exact: true })).toBeVisible();
  const detailAssessment = page.locator("[data-match-assessment]:visible");
  await expect(detailAssessment).toHaveAttribute("data-fit", fit ?? "");
  expect(await detailAssessment.innerText()).toBe(assessmentText);
  await assertAccessible(page);

  await page.getByRole("button", { name: "Shortlist this job" }).click();
  await expect(page.getByText("Shortlisted.")).toBeVisible();

  await page.getByRole("link", { name: "Fresh feed" }).click();
  const dismissTarget = jobCard(page, "Baker i Østfold");
  await expect(dismissTarget).toBeVisible();
  await dismissTarget.getByRole("button", { name: "Dismiss" }).click();
  await expect(dismissTarget).toBeHidden();
});
