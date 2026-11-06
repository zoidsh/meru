import { ms } from "@meru/shared/ms";
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests",
  // Not *.spec.ts: `bun test` claims that name and would try to run these files
  // as unit tests, where Playwright's test() throws.
  testMatch: "**/*.e2e.ts",
  // Spreads tests rather than files across workers and shards, so one slow file
  // can't hold up a single worker. Each test launches its own app on a fresh
  // profile, and the single instance lock lives in that profile.
  fullyParallel: true,
  // The smallest hosted runner, macOS, has 3 vCPUs.
  workers: process.env.CI ? 3 : undefined,
  timeout: ms("2m"),
  expect: {
    timeout: ms("1m"),
  },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  retries: process.env.CI ? 2 : 0,
});
