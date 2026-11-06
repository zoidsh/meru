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
  // A native resize's modal loop warps the one cursor and ends when another
  // window activates, so it can't share the desktop with an app launching.
  // Running it first as a dependency is what keeps every other test off the
  // desktop meanwhile, and a shard runs its dependencies whole.
  projects: [
    { name: "exclusive", testMatch: "native-resize.e2e.ts", workers: 1 },
    { name: "parallel", testIgnore: "native-resize.e2e.ts", dependencies: ["exclusive"] },
  ],
  timeout: ms("2m"),
  expect: {
    timeout: ms("1m"),
  },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  retries: process.env.CI ? 2 : 0,
});
