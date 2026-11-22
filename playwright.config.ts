import { defineConfig } from "@playwright/test";

/**
 * Taleora E2E tests — run against the production build (npm run build && npm start).
 *
 * NOTE: Browser download is required (`npx playwright install`). This sandbox cannot
 * download browsers — run E2E in CI where downloads are permitted.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000",
    trace: "retain-on-failure",
  },
  webServer: process.env.E2E_BASE_URL ? undefined : {
    command: "npm run start",
    port: 3000,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
