import { spawnSync } from "node:child_process";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { hookAction, hookScript } from "./lib/hooks.ts";

const HOOKS = ["pre-commit"];

const hooksDir = spawnSync(
  "git",
  ["rev-parse", "--path-format=absolute", "--git-path", "hooks"],
  { encoding: "utf-8" }
);

if (hooksDir.status !== 0) {
  console.log("Git hooks: not a git checkout; skipped.");
  process.exit(0);
}

const dir = hooksDir.stdout.trim();

await mkdir(dir, { recursive: true });

const readExisting = async (file: string) => {
  try {
    return await readFile(file, "utf-8");
  } catch {
    // No hook is installed yet.
  }
};

await Promise.all(
  HOOKS.map(async (hook) => {
    const file = path.join(dir, hook);
    const action = hookAction({
      ci: Boolean(process.env.CI),
      existing: await readExisting(file),
    });

    if (action === "write") {
      await writeFile(file, hookScript(hook));
      await chmod(file, 0o755);
    }

    console.log(`Git hooks: ${hook}: ${action}`);
  })
);
