import { defineConfig } from "@playwright/test";

export default defineConfig({
  forbidOnly: Boolean(process.env.CI),
  globalSetup: "./tests/global-setup.ts",
  reporter: process.env.CI === undefined ? "list" : "github",
  retries: 0,
  projects: [
    { name: "e2e", testIgnore: "**/budget.e2e.ts" },
    // A minute of idle per run, so it runs by hand on a Mac rather than with the rest.
    { name: "budget", testMatch: "**/budget.e2e.ts" },
  ],
  testDir: "tests",
  // Not *.spec.ts or *.test.ts, which Vitest would claim.
  testMatch: "**/*.e2e.ts",
  timeout: 30_000,
});
