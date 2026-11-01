import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * WS-0025@2 acceptance, end to end against the local preview: the Worker
 * serves `apps/index-web/dist` and the real read API over the seeded local D1
 * (`dev/preview-seed.sql`: cj_1 to cj_3 active, cj_4 closed). Every page state
 * the specs reach is also checked with Axe (WCAG 2.1 A and AA).
 */
const expectNoAxeViolations = async (page: Page) => {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(results.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((n) => n.target) }))).toEqual([]);
};

// The API pages in change-sequence order (`/api/v1/jobs`), which the list keeps.
const results = (page: Page) => page.getByRole("region", { name: "Results" });

test("browse lists the current vacancies only", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Current vacancies" })).toBeVisible();
  await expect(results(page).getByRole("status")).toHaveText("3 vacancies");
  const titles = results(page).getByRole("listitem").getByRole("link");
  await expect(titles).toHaveText(["Baker i Østfold", "Frontendutvikler", "Sykepleier natt"], {
    useInnerText: true,
  });
  await expect(page.getByRole("link", { name: "Lærer i matematikk" })).toHaveCount(0);
  await expectNoAxeViolations(page);
});

test("filters live in the URL: reload, back and forward restore them", async ({ page }) => {
  await page.goto("/");
  await expect(results(page).getByRole("status")).toHaveText("3 vacancies");

  await page.getByLabel("Text").fill("utvikler");
  await page.getByLabel("Location").fill("Oslo");
  await page.getByRole("button", { name: "Search" }).click();

  await expect(page).toHaveURL("/?term=utvikler&location=Oslo");
  await expect(results(page).getByRole("status")).toHaveText("1 vacancy");
  await expect(results(page).getByRole("link", { name: "Frontendutvikler" })).toBeVisible();
  await expectNoAxeViolations(page);

  await page.reload();
  await expect(page.getByLabel("Text")).toHaveValue("utvikler");
  await expect(page.getByLabel("Location")).toHaveValue("Oslo");
  await expect(results(page).getByRole("status")).toHaveText("1 vacancy");

  await page.goBack();
  await expect(page).toHaveURL("/");
  await expect(page.getByLabel("Text")).toHaveValue("");
  await expect(results(page).getByRole("status")).toHaveText("3 vacancies");

  await page.goForward();
  await expect(page).toHaveURL("/?term=utvikler&location=Oslo");
  await expect(results(page).getByRole("status")).toHaveText("1 vacancy");

  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page).toHaveURL("/");
  await expect(results(page).getByRole("status")).toHaveText("3 vacancies");
});

test("a shared filter link with no match says so", async ({ page }) => {
  await page.goto("/?term=astronaut");
  await expect(results(page).getByText("No current vacancies match these filters.")).toBeVisible();
  await expectNoAxeViolations(page);
});

test("detail shows the vacancy and its source reference", async ({ page }) => {
  await page.goto("/?location=Bergen");
  await page.getByRole("link", { name: "Sykepleier natt" }).click();

  await expect(page).toHaveURL("/jobs/cj_3");
  await expect(page.getByRole("heading", { level: 1, name: "Sykepleier natt" })).toBeVisible();
  await expect(page.getByText("Bergen Kommune")).toBeVisible();
  const source = page.getByRole("region", { name: "Source" });
  await expect(source.getByText("Reported by: nav")).toBeVisible();
  await expect(source.getByRole("link", { name: "Open the original listing" })).toHaveAttribute(
    "href",
    "https://example.com/job/3",
  );
  await expectNoAxeViolations(page);

  await page.getByRole("link", { name: "Back to vacancies" }).click();
  await expect(page).toHaveURL("/?location=Bergen");
  await expect(page.getByLabel("Location")).toHaveValue("Bergen");
});

test("a deep link reaches a closed vacancy, and an unknown id explains itself", async ({ page }) => {
  await page.goto("/jobs/cj_4");
  await expect(page.getByRole("heading", { level: 1, name: "Lærer i matematikk" })).toBeVisible();
  await expect(page.getByText("Closed 2026-08-04T10:00:00Z")).toBeVisible();
  await expectNoAxeViolations(page);

  await page.goto("/jobs/cj_missing");
  await expect(page.getByRole("alert")).toContainText("No vacancy has this id.");
  await expectNoAxeViolations(page);
});

test("an unknown path renders the client's not-found page", async ({ page }) => {
  await page.goto("/no/such/page");
  await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
  await expectNoAxeViolations(page);
});
