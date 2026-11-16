import { existsSync } from "node:fs";
import path from "node:path";

import { outDir } from "./lib/bundles.ts";
import { launchElectron, parseLaunchArgs, stopElectron } from "./lib/launch.ts";

if (!existsSync(path.join(outDir("prod"), "package.json"))) {
  console.error("Nothing is built in out/prod; run `pnpm build` first.");
  process.exit(1);
}

const electron = await launchElectron({
  appDir: outDir("prod"),
  args: parseLaunchArgs(process.argv.slice(2)),
});

const stop = async () => {
  await stopElectron(electron);
  process.exit(0);
};

process.once("SIGINT", stop);
process.once("SIGTERM", stop);

electron.once("exit", (code) => {
  process.exit(code ?? 0);
});
