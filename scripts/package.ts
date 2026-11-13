// node scripts/package.ts [--dir|--mac|--linux|--win] [electron-builder argument…]
import path from "node:path";

import { ExecaError, execa } from "execa";

import { hasSigningEnv } from "../packaging/signing-env.ts";

const root = path.join(import.meta.dirname, "..");

const [mode = "--dir", ...rest] = process.argv.slice(2);
if (!["--dir", "--mac", "--linux", "--win"].includes(mode)) {
  throw new Error(`Package with --dir, --mac, --linux or --win, not ${mode}`);
}

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

try {
  await execa("pnpm", ["build"], { cwd: root, stdio: "inherit" });
  await execa(
    "electron-builder",
    [
      "--config",
      "packaging/electron-builder.config.ts",
      ...(mode === "--dir" ? ["--dir"] : ["--publish", "never", mode]),
      ...rest,
    ],
    {
      cwd: root,
      env: local ? { MERU_LOCAL_PACKAGE: "1" } : {},
      localDir: path.join(root, "packaging"),
      preferLocal: true,
      stdio: "inherit",
    }
  );
} catch (error) {
  if (!(error instanceof ExecaError)) {
    throw error;
  }
  process.exitCode = error.exitCode ?? 1;
}
