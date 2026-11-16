/*
 * Packs the end-to-end build for this machine, then runs the suite on it.
 * `MERU_SKIP_BUILD=1` reuses the build in dist/e2e and `MERU_EXECUTABLE`
 * names any packed app; either skips packing. Other arguments go to
 * Playwright.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { repositoryRoot } from "./lib/bundles.ts";

const run = (args: string[]) => {
  const result = spawnSync(process.execPath, args, { stdio: "inherit" });

  return result.status ?? 1;
};

if (!(process.env.MERU_EXECUTABLE || process.env.MERU_SKIP_BUILD)) {
  const status = run([
    path.join(repositoryRoot, "scripts", "package.ts"),
    "--e2e",
  ]);

  if (status !== 0) {
    process.exit(status);
  }
}

process.exit(
  run([
    fileURLToPath(import.meta.resolve("@playwright/test/cli")),
    "test",
    "--config",
    path.join(repositoryRoot, "e2e", "playwright.config.ts"),
    ...process.argv.slice(2),
  ])
);
