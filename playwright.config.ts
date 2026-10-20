import { ms } from "@meru/shared/ms";
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests",
  // Not *.spec.ts: `bun test` claims that name and would try to run these files
  // as unit tests, where Playwright's test() throws.
  testMatch: "**/*.e2e.ts",
  // Spreads tests rather than files across CI's shards, which would otherwise
  // leave one shard holding a whole slow file. Each test launches its own app
  // on a fresh profile, so none depends on another having run in the same shard.
  fullyParallel: true,
  // The app takes a single instance lock, and each test drives a window of its
  // own, so nothing here is safe to run against itself in parallel. Playwright's
  // own Electron suite and Element's desktop app both settle on the same.
  workers: 1,
  timeout: ms("2m"),
  expect: {
    timeout: ms("1m"),
  },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  retries: process.env.CI ? 2 : 0,
});
