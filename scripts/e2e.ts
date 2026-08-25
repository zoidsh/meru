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
// against the same build costs nothing, and when MERU_SKIP_BUILD says one is
// already in dist. The second exists because the tests resolve that path per
// platform themselves: naming it again to skip a build would be the same three
// paths written down in a second place, free to drift from the first.
if (!process.env.MERU_EXECUTABLE && !process.env.MERU_SKIP_BUILD) {
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
