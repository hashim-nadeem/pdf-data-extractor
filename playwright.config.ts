import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end run against the real app and a real model, so the hover-to-highlight
 * interaction is actually exercised rather than assumed.
 */
export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/.output",
  timeout: 210_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  // Drives the locally installed Chrome. Swap to the bundled build with
  // `npx playwright install chromium` and dropping `channel` if you want it pinned.
  projects: [{ name: "chrome", use: { ...devices["Desktop Chrome"], channel: "chrome" } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
