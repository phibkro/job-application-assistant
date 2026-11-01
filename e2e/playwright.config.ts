import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.BASE_URL ?? "http://127.0.0.1:8799";

/**
 * Without BASE_URL the suite starts the real local stack itself
 * (`scripts/preview.sh`: the index client build, the Worker bundle, a fresh
 * seeded local D1, `wrangler dev`) and stops it afterwards, so `vp run e2e`
 * tests what a deploy would serve. With BASE_URL it targets that server only.
 */
const webServer = process.env.BASE_URL
  ? undefined
  : {
      command: "bash scripts/preview.sh",
      cwd: "..",
      url: `${baseURL}/api/health`,
      reuseExistingServer: false,
      timeout: 180_000,
      stdout: "ignore" as const,
      stderr: "pipe" as const,
    };

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  webServer,
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // The Playwright-bundled headless shell cannot resolve its shared
        // libraries on this machine; the Nix-provided Chromium can.
        launchOptions: {
          executablePath: "/etc/profiles/per-user/nori/bin/chromium",
        },
      },
    },
  ],
});
