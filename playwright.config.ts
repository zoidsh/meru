import { defineConfig } from "@playwright/test";

export default defineConfig({
  forbidOnly: Boolean(process.env.CI),
  globalSetup: "./tests/global-setup.ts",
  reporter: process.env.CI === undefined ? "list" : "github",
  retries: 0,
  testDir: "tests",
  // Not *.spec.ts or *.test.ts, which Vitest would claim.
  testMatch: "**/*.e2e.ts",
  timeout: 30_000,
});
