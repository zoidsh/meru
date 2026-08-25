import { ms } from "@meru/shared/ms";
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests",
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
  /*
   * Two projects rather than one suite, so that `bun run test:e2e` and
   * `bun run test:perf` each run their own and neither waits on the other.
   * Both scripts name their project; running the config bare runs everything.
   *
   * Not *.spec.ts for either: `bun test` claims that name and would try to run
   * these files as unit tests, where Playwright's test() throws.
   */
  projects: [
    { name: "e2e", testMatch: "**/*.e2e.ts" },
    {
      name: "perf",
      testMatch: "**/*.perf.ts",
      // Longer than the suite default, because a leak check is several passes
      // over every settings page and a forced collection between each of them,
      // and there is no way to make that quick without measuring less.
      timeout: ms("6m"),
      // Never retried, even on CI. A retry of a measurement is a second sample
      // reported as if it were the first, which is how a flaky figure becomes a
      // baseline nobody can reproduce.
      retries: 0,
    },
  ],
});
