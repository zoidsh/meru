import path from "node:path";

import { defineConfig } from "@playwright/test";

const isCI = Boolean(process.env.CI);

/**
 * On Windows main's focus of a page activates its window, which takes the
 * desktop's focus from every other worker's app, and an overlay, the unified
 * inbox among them, closes when its window loses it, and a test that follows
 * real focus sees it taken, so these run alone there, after the rest. One
 * worker for the whole suite would cost about ten minutes more on CI's
 * runner (the shared group takes 5.5 minutes at three workers). On macOS the
 * suite's app is never activated, and on Linux each worker draws on an X
 * display of its own (`e2e/lib/app.ts`), so there every file shares.
 */
const NEEDS_THE_FOCUS = [
  "**/overlay.e2e.ts",
  "**/inbox.e2e.ts",
  "**/settings-profile-mail.e2e.ts",
  "**/settings-profile-enabled.e2e.ts",
  "**/downloads.e2e.ts",
  "**/open-app.e2e.ts",
  "**/tab-menu.e2e.ts",
  "**/tab-sleep.e2e.ts",
  "**/profile-sleep.e2e.ts",
  "**/split.e2e.ts",
  "**/split-resize.e2e.ts",
  "**/split-drags.e2e.ts",
  "**/split-view-drags.e2e.ts",
  "**/split-several.e2e.ts",
  "**/find.e2e.ts",
  "**/own-window.e2e.ts",
  "**/bookmarks.e2e.ts",
  "**/general.e2e.ts",
  // Its title bar switches' test opens New tab, the unified inbox and
  // Downloads from the menu.
  "**/appearance.e2e.ts",
  // Its shots picture overlays, which another app taking the focus would
  // close unseen, since a shot asserts nothing.
  "**/screens.e2e.ts",
  // It opens New tab and toasts, which the window's blur closes, and checks
  // that a page keeps the real focus.
  "**/trial.e2e.ts",
  // Its free version's Add another account shows a toast the blur closes.
  "**/gate-profiles.e2e.ts",
  // Its New tab test opens the launcher twice, which the blur closes.
  "**/settings-tabs-apps.e2e.ts",
  // It opens Downloads over the update card, which the blur closes.
  "**/update-card.e2e.ts",
  // Its New tab test opens the launcher, which the blur closes.
  "**/settings-scope-apps.e2e.ts",
  // Its free version's link shows a toast the blur closes.
  "**/email-links.e2e.ts",
];
const takesTheFocus = process.platform === "win32";

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
