import { defineConfig } from "@playwright/test";

// Runs against the locally deployed frontend canister (`icp deploy` first), so
// tests see the real certified responses and headers.
export default defineConfig({
  testDir: "tests",
  globalSetup: "./tests/support/global-setup.ts",
  reporter: "list",
  // Tests share one local canister's state (settings, admins, rate limits).
  workers: 1,
  use: {
    baseURL: process.env.BASE_URL ?? "http://web.local.localhost:8000",
    launchOptions: { args: ["--disable-gpu"] },
  },
});
