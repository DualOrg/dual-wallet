import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  // Next dev compiles App Router entries on demand. A single browser worker
  // keeps navigation deterministic while the local web server warms routes.
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  outputDir: "test-results",
  use: {
    baseURL: "http://demo.localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: [
    {
      command: "node e2e/mock-api.mjs",
      url: "http://127.0.0.1:4010/health",
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "npm run dev",
      url: "http://demo.localhost:3000",
      reuseExistingServer: !process.env.CI,
      env: {
        ...process.env,
        API_URL: "http://127.0.0.1:4010",
        VIEWER_BASE_DOMAIN: "wallet.dual.network",
        NEXT_PUBLIC_APP_URL: "http://demo.localhost:3000",
      },
    },
  ],
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
