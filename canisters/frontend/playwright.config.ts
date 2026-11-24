import { defineConfig } from "@playwright/test";

// Runs against the locally deployed frontend canister (`icp deploy` first), so
// tests see the real certified responses and headers.
export default defineConfig({
  testDir: "tests/e2e",
  reporter: "list",
  use: {
    baseURL: process.env.BASE_URL ?? "http://frontend.local.localhost:8000",
    launchOptions: { args: ["--disable-gpu"] },
  },
});
