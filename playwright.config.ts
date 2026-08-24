import { ms } from "@meru/shared/ms";
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests",
  // Not *.spec.ts: `bun test` claims that name and would try to run this file
  // as a unit test, where Playwright's test() throws.
  testMatch: "**/*.e2e.ts",
  // The app takes a single instance lock, and each test drives a window of its
  // own, so nothing here is safe to run against itself in parallel. Playwright's
  // own Electron suite and Element's desktop app both settle on the same.
  workers: 1,
  fullyParallel: false,
  timeout: ms("2m"),
  expect: {
    timeout: ms("1m"),
  },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  retries: process.env.CI ? 2 : 0,
});
