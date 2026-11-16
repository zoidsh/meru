import path from "node:path";

import { defineConfig } from "@playwright/test";

const isCI = Boolean(process.env.CI);

export default defineConfig({
  // Never *.spec.ts or *.test.ts, which Vitest would claim.
  testMatch: "**/*.e2e.ts",
  outputDir: path.join(import.meta.dirname, "..", "test-results"),
  // Each test launches its own app on a user data directory of its own, so
  // tests rather than files spread across workers.
  fullyParallel: true,
  // Locally Playwright's own default; CI's smallest runner, macOS, has three
  // cores.
  workers: isCI ? 3 : "50%",
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
});
