/*
 * Builds the app for the machine it is on, then runs the end-to-end suite
 * against what it built.
 *
 * Unpacked and one architecture: the tests launch the app rather than
 * installing it, so packing installers would be time spent on output nothing
 * opens. Building here rather than in CI is what keeps `bun run test:e2e` a
 * single command on every platform.
 */
import { spawn } from "bun";

const BUILDS = {
  darwin: { script: "build:mac", arch: "--arm64" },
  linux: { script: "build:linux", arch: "--x64" },
  win32: { script: "build:win", arch: "--x64" },
} as const;

const build = BUILDS[process.platform as keyof typeof BUILDS];

if (!build) {
  throw new Error(
    `No app build is defined for ${process.platform}. Build the app and point MERU_EXECUTABLE at it.`,
  );
}

async function run(command: string[]) {
  const { exited } = spawn(command, { stdout: "inherit", stderr: "inherit" });

  return await exited;
}

// Skipped when MERU_EXECUTABLE names an app already built, so that a rerun
// against the same build costs nothing.
if (!process.env.MERU_EXECUTABLE) {
  const buildStatus = await run([
    "bun",
    "run",
    build.script,
    "--",
    "--dir",
    build.arch,
    "--publish",
    "never",
  ]);

  if (buildStatus !== 0) {
    process.exit(buildStatus);
  }
}

// Arguments carry through, so `bun run test:e2e --ui` and friends still work.
process.exit(await run(["bunx", "playwright", "test", ...Bun.argv.slice(2)]));
