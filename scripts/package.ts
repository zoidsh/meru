// node scripts/package.ts [--dir|--mac|--linux|--win] [electron-builder argument…]
import { spawnSync } from "node:child_process";
import path from "node:path";

import { hasSigningEnv } from "../packaging/signing-env.ts";

const root = path.join(import.meta.dirname, "..");
// The JavaScript entry rather than the .bin shim, which is a .cmd on Windows that spawn cannot run without a shell.
const builder = path.join(
  root,
  "packaging/node_modules/electron-builder/cli.js"
);

const [mode = "--dir", ...rest] = process.argv.slice(2);
if (!["--dir", "--mac", "--linux", "--win"].includes(mode)) {
  throw new Error(`Package with --dir, --mac, --linux or --win, not ${mode}`);
}

const run = (command: string, args: readonly string[], env = process.env) => {
  const { status, error } = spawnSync(command, args, {
    cwd: root,
    env,
    shell: process.platform === "win32" && command === "pnpm",
    stdio: "inherit",
  });
  if (error !== undefined) {
    throw error;
  }
  if (status !== 0) {
    process.exit(status ?? 1);
  }
};

// Before the build, so a partial signing environment fails in seconds.
if (mode === "--mac" || mode === "--win") {
  const platform = mode === "--mac" ? "mac" : "win";
  console.log(
    hasSigningEnv(platform)
      ? `Signing the ${platform} build`
      : `Building ${platform} unsigned: no signing environment is set`
  );
}

// A build in CI is the one a release ships, so it carries no marker and uses Electron's default user data.
const local = process.env.GITHUB_ACTIONS !== "true";

run("pnpm", ["build"]);
run(
  process.execPath,
  [
    builder,
    "--config",
    "packaging/electron-builder.config.ts",
    ...(mode === "--dir" ? ["--dir"] : ["--publish", "never", mode]),
    ...rest,
  ],
  local ? { ...process.env, MERU_LOCAL_PACKAGE: "1" } : process.env
);
