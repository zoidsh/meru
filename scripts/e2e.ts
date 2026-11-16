/*
 * Packs the end-to-end build for this machine, then runs the suite on it.
 * `MERU_SKIP_BUILD=1` reuses the build in dist/e2e and `MERU_EXECUTABLE`
 * names any packed e2e app; either skips packing. Other arguments go to
 * Playwright.
 */
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { once } from "node:events";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { repositoryRoot } from "./lib/bundles.ts";
import { exitCodeFor } from "./lib/launch-args.ts";

const SIGNALS = ["SIGINT", "SIGTERM", "SIGHUP"] as const;

let current: ChildProcess | undefined;
let isStopping = false;

// A signal sent to this script alone, not its process group, still reaches
// the runner, which stops the apps it launched.
const forward = (signal: NodeJS.Signals) => {
  isStopping = true;

  if (current) {
    current.kill(signal);
  } else {
    process.exit(1);
  }
};

for (const signal of SIGNALS) {
  process.on(signal, forward);
}

const run = async (args: string[]) => {
  const child = spawn(process.execPath, args, { stdio: "inherit" });

  current = child;

  const [code, signal] = (await once(child, "exit")) as [
    number | null,
    NodeJS.Signals | null,
  ];

  current = undefined;

  return exitCodeFor(code, signal);
};

if (!(process.env.MERU_EXECUTABLE || process.env.MERU_SKIP_BUILD === "1")) {
  const status = await run([
    path.join(repositoryRoot, "scripts", "package.ts"),
    "--e2e",
  ]);

  if (status !== 0 || isStopping) {
    process.exit(status || 1);
  }
}

process.exit(
  await run([
    fileURLToPath(import.meta.resolve("@playwright/test/cli")),
    "test",
    "--config",
    path.join(repositoryRoot, "e2e", "playwright.config.ts"),
    ...process.argv.slice(2),
  ])
);
