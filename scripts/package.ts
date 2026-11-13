// node scripts/package.ts [--dir|--mac|--linux|--win] [electron-builder argument…]
import { spawnSync } from "node:child_process";
import path from "node:path";

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
  { ...process.env, MERU_LOCAL_PACKAGE: "1" }
);
