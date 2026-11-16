import { existsSync } from "node:fs";
import path from "node:path";

import { once } from "es-toolkit";

import { outDir } from "./lib/bundles.ts";
import { exitCodeFor } from "./lib/launch-args.ts";
import {
  readLaunchArgs,
  spawnElectron,
  stopElectron,
  wasStoppedByScript,
} from "./lib/launch.ts";

if (!existsSync(path.join(outDir("prod"), "package.json"))) {
  console.error("Nothing is built in out/prod; run `pnpm build` first.");
  process.exit(1);
}

const child = spawnElectron({ appDir: outDir("prod"), ...readLaunchArgs() });

const stop = once(async () => {
  await stopElectron(child);
  process.exit(0);
});

// A repeated signal, such as a second Ctrl-C, joins the shutdown under way.
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
  process.on(signal, () => {
    void stop();
  });
}

process.once("exit", () => {
  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
  }
});

child.once("error", (error) => {
  console.error(error);
  process.exit(1);
});

child.once("exit", (code, signal) => {
  if (!wasStoppedByScript(child)) {
    process.exit(exitCodeFor(code, signal));
  }
});
