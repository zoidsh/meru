/*
 * Builds the app and packs it for the platform this runs on, unsigned.
 *
 *   --installers  the installers the release config names, rather than only
 *                 the unpacked app for this machine's architecture
 *   --e2e         the end-to-end suite's variant, into dist/e2e; never with
 *                 --installers, so no installer can carry it
 */
import { spawnSync } from "node:child_process";
import { rm } from "node:fs/promises";
import path from "node:path";

import { Arch, build, Platform } from "electron-builder";

import { createConfig, packOutputDir } from "../electron-builder.config.ts";
import { repositoryRoot } from "./lib/bundles.ts";

const args = new Set(process.argv.slice(2));
const isE2e = args.delete("--e2e");
const isInstallers = args.delete("--installers");

if (args.size > 0) {
  console.error(`Unknown arguments: ${[...args].join(" ")}`);
  process.exit(1);
}

if (isE2e && isInstallers) {
  console.error("The end-to-end variant is never packed into installers.");
  process.exit(1);
}

const built = spawnSync(
  process.execPath,
  [
    path.join(repositoryRoot, "scripts", "build.ts"),
    ...(isE2e ? ["--e2e"] : []),
  ],
  { stdio: "inherit" }
);

if (built.status !== 0) {
  process.exit(built.status ?? 1);
}

const arch = Arch[process.arch as keyof typeof Arch];

if (typeof arch !== "number") {
  console.error(`electron-builder has no architecture named ${process.arch}`);
  process.exit(1);
}

const platform = Platform.current();

// electron-builder signs Windows with any certificate these name, config or
// not; signing is not set up yet, so a build is unsigned whatever the shell
// exports.
for (const name of [
  "CSC_LINK",
  "CSC_KEY_PASSWORD",
  "WIN_CSC_LINK",
  "WIN_CSC_KEY_PASSWORD",
]) {
  Reflect.deleteProperty(process.env, name);
}

const variant = isE2e ? "e2e" : "release";

// A stale app from another version could carry another name and id, such as
// the installed Meru's, beside the one packed now.
await rm(packOutputDir(variant), { recursive: true, force: true });

const outputs = await build({
  projectDir: repositoryRoot,
  config: createConfig(variant),
  targets: isInstallers
    ? platform.createTarget()
    : platform.createTarget("dir", arch),
  publish: "never",
});

for (const output of outputs) {
  console.log(path.relative(repositoryRoot, output));
}
