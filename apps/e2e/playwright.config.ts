import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests drive the real stack: Next.js web app -> Express API -> Postgres (+ Redis).
 * Locally they reuse already-running dev servers; in CI they start the API and a production
 * build of the web app (built beforehand by the workflow).
 */
const CI = !!process.env.CI;
const WEB = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  workers: CI ? 2 : undefined,
  reporter: CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: WEB,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : [
        {
          command: "npm --prefix ../api run start",
          url: "http://localhost:4000/api/health",
          reuseExistingServer: !CI,
          timeout: 120_000,
          stdout: "pipe",
        },
        {
          command: CI ? "npm --prefix ../web run start" : "npm --prefix ../web run dev",
          url: `${WEB}/login`,
          reuseExistingServer: !CI,
          timeout: 180_000,
        },
      ],
});
