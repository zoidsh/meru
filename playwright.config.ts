import { ms } from "@meru/shared/ms";
import { defineConfig } from "@playwright/test";
import { config as loadTestEnvironment } from "dotenv";

/*
 * The license key the Pro suite launches with. CI passes it as a secret, and a
 * local run keeps it in `.env.test.local`.
 *
 * Loaded here rather than left to Bun, which reads that file only when NODE_ENV
 * says test — nothing sets it — and never at all in a worker Playwright started
 * under Node. Every entry point loads this config, and so does every worker, so
 * this is the one place that covers `bun run test:e2e` and a bare
 * `playwright test` alike. An environment variable that is already set wins,
 * which is what leaves CI's secret in charge.
 */
loadTestEnvironment({ path: ".env.test.local", quiet: true });

export default defineConfig({
  testDir: "tests",
  // Activates the test license key for this machine before anything launches.
  // A device the key has never been activated on fails validation at startup,
  // which the app answers with a dialog on a windowless app.
  globalSetup: "./tests/lib/global-setup.ts",
  // The app takes a single instance lock, and each test drives a window of its
  // own, so nothing here is safe to run against itself in parallel. Playwright's
  // own Electron suite and Element's desktop app both settle on the same.
  workers: 1,
  fullyParallel: false,
  timeout: ms("2m"),
  expect: {
    timeout: ms("1m"),
  },
  /*
   * The HTML report goes to a folder of its own per project, which
   * `scripts/e2e.ts` names. Both projects are separate `playwright test` runs,
   * and a run empties the report folder before it writes — so sharing one meant
   * the performance run replacing the end-to-end report, including the trace
   * from an attempt that failed before a retry passed. That trace is the whole
   * reason the report is uploaded.
   */
  reporter: process.env.CI
    ? [
        ["list"],
        [
          "html",
          { open: "never", outputFolder: process.env.MERU_REPORT_DIR ?? "playwright-report" },
        ],
      ]
    : [["list"]],
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
    { name: "e2e", testMatch: "**/*.e2e.ts", outputDir: "test-results/e2e" },
    {
      name: "perf",
      testMatch: "**/*.perf.ts",
      outputDir: "test-results/perf",
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
