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

async function run(command: string[], env?: Record<string, string>) {
  const { exited } = spawn(command, {
    stdout: "inherit",
    stderr: "inherit",
    env: { ...process.env, ...env },
  });

  return await exited;
}

const PROJECT_FLAG = "--project=";

/**
 * Which project this run is for, so that its report lands in a folder of its
 * own.
 *
 * Each project is a separate `playwright test` run, and a run empties the
 * report folder before writing to it. Sharing one meant whichever ran second
 * replaced the first's report and the traces it indexes — including, on CI, the
 * trace from an end-to-end attempt that failed before a retry passed, which is
 * the run worth having. The output directories are separated in the config for
 * the same reason.
 */
const project = Bun.argv.slice(2).find((argument) => argument.startsWith(PROJECT_FLAG));

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
process.exit(
  await run(
    ["bunx", "playwright", "test", ...Bun.argv.slice(2)],
    project
      ? { MERU_REPORT_DIR: `playwright-report/${project.slice(PROJECT_FLAG.length)}` }
      : undefined,
  ),
);
