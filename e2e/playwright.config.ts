import path from "node:path";

import { defineConfig } from "@playwright/test";

const isCI = Boolean(process.env.CI);

/**
 * On Windows and Linux every launch of the suite's app takes the desktop's
 * focus, and an overlay, the unified inbox among them, closes when its window
 * loses it, so these run alone, after the rest. On
 * macOS the suite's app is never activated.
 */
const NEEDS_THE_FOCUS = [
  "**/overlay.e2e.ts",
  "**/inbox.e2e.ts",
  "**/open-app.e2e.ts",
];
const takesTheFocus = process.platform !== "darwin";

export default defineConfig({
  // Never *.spec.ts or *.test.ts, which Vitest would claim.
  testMatch: "**/*.e2e.ts",
  outputDir: path.join(import.meta.dirname, "..", "test-results"),
  // Each test launches its own app on a user data directory of its own, so
  // tests rather than files spread across workers.
  fullyParallel: true,
  // Locally Playwright's own default, which on CI's four-core runners would
  // be two.
  workers: isCI ? 3 : "50%",
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  projects: [
    { name: "shared", testIgnore: NEEDS_THE_FOCUS },
    {
      name: "alone",
      testMatch: NEEDS_THE_FOCUS,
      ...(takesTheFocus && { workers: 1, dependencies: ["shared"] }),
    },
  ],
});
