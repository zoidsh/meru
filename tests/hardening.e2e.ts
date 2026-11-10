/*
 * The packaged build's hardening: the fuses it carries, what they refuse, and
 * on macOS that the swipe addon still loads in the fused, signed app.
 *
 * Each refusal runs beside a control, a copy of the same build with only that
 * fuse flipped the other way, which must do what the shipped one refuses. A
 * check that proves nothing looks exactly like one that passes.
 */
import { spawn } from "node:child_process";
import { constants, existsSync } from "node:fs";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { flipFuses, FuseV1Options, FuseVersion, getCurrentFuseWire } from "@electron/fuses";
import { ms } from "@meru/shared/ms";
import type { SwipeNavigationAddon } from "@meru/swipe-navigation";
import { expect, test } from "@playwright/test";
import { E2E_FUSE_OVERRIDES } from "../scripts/lib/e2e-fuses";
import { EXECUTABLE_PATH, launchArguments, useApp } from "./lib/app";
import { killTree } from "./lib/process-tree";
import { startTestServer, type TestServer } from "./lib/server";

// An option of electron-builder's fuse writer rather than a bit on the wire.
const WRITER_OPTIONS = new Set(["resetAdHocDarwinSignature"]);

const STARTUP_TIMEOUT = ms("1m");

const POLL_INTERVAL = 100;

const OUTPUT_CHARS_KEPT = 4000;

// On macOS the wire is in Electron Framework, so the unit that is copied is the
// bundle, which `@electron/fuses` finds the framework from; elsewhere the wire
// is in the executable, in a directory copied whole.
const APP_ROOT =
  process.platform === "darwin"
    ? path.resolve(EXECUTABLE_PATH, "..", "..", "..")
    : path.dirname(EXECUTABLE_PATH);

function fuseTarget(appRoot: string, executable: string) {
  return process.platform === "darwin" ? appRoot : executable;
}

type Fuses = Record<string, boolean>;

function fuseIndex(name: string) {
  const option = (name.charAt(0).toUpperCase() + name.slice(1)) as keyof typeof FuseV1Options;

  return FuseV1Options[option] as FuseV1Options | undefined;
}

/** `build.electronFuses` from package.json, less what never reaches the wire. */
async function readReleaseFuses(): Promise<Fuses> {
  const packageJson = JSON.parse(await readFile(path.join(process.cwd(), "package.json"), "utf8"));

  const declared = packageJson.build.electronFuses as Fuses;

  const unknown = Object.keys(declared).filter(
    (name) => !WRITER_OPTIONS.has(name) && fuseIndex(name) === undefined,
  );

  if (unknown.length > 0) {
    throw new Error(
      `package.json's build.electronFuses names ${unknown.join(", ")}, which @electron/fuses has no wire index for. Update @electron/fuses, or add a writer option to WRITER_OPTIONS.`,
    );
  }

  return Object.fromEntries(Object.entries(declared).filter(([name]) => !WRITER_OPTIONS.has(name)));
}

/** Each named fuse as the binary carries it, true or false, or the raw state when neither. */
async function readFuses(appPath: string, names: string[]) {
  const wire = await getCurrentFuseWire(appPath);

  return Object.fromEntries(
    names.map((name) => {
      const state = String.fromCharCode(wire[fuseIndex(name) as FuseV1Options] as number);

      return [name, state === "1" ? true : state === "0" ? false : `state "${state}"`];
    }),
  );
}

/**
 * Seconds rather than a build: cloned on APFS, and on the other platforms
 * copied, which is about the app's size in disk throughput.
 */
async function copyApp(
  dir: string,
  fuses: Partial<Fuses>,
  { remove = [] }: { remove?: string[] } = {},
) {
  const root = path.join(dir, path.basename(APP_ROOT));

  await cp(APP_ROOT, root, {
    recursive: true,
    // A framework's symlinks are relative, and made absolute they would point
    // the copy back into the build it came from.
    verbatimSymlinks: true,
    mode: constants.COPYFILE_FICLONE,
  });

  // Before the flip, whose re-signing seals the bundle as it is left.
  for (const relativePath of remove) {
    await rm(path.join(root, relativePath));
  }

  const executable = path.join(root, path.relative(APP_ROOT, EXECUTABLE_PATH));

  await flipFuses(fuseTarget(root, executable), {
    version: FuseVersion.V1,
    // The flip invalidates the signature, and arm64 macOS kills a binary whose
    // signature does not hold.
    resetAdHocDarwinSignature: true,
    ...Object.fromEntries(
      Object.entries(fuses).map(([name, value]) => [fuseIndex(name) as FuseV1Options, value]),
    ),
  });

  return executable;
}

type Probe = {
  /** A directory of the test's own, which the probe's files go in. */
  dir: string;
  /** A script that writes `marker` when Node runs it. */
  markerScript: string;
  /** A script that does nothing, for a run whose marker comes from elsewhere. */
  noopScript: string;
  marker: string;
};

async function createProbe(dir: string): Promise<Probe> {
  const marker = path.join(dir, "marker");

  const markerScript = path.join(dir, "marker.js");

  const noopScript = path.join(dir, "noop.js");

  await writeFile(markerScript, `require("node:fs").writeFileSync(${JSON.stringify(marker)}, "")`);

  await writeFile(noopScript, "");

  return { dir, markerScript, noopScript, marker };
}

type Outcome = {
  /** Whether it came up as Meru rather than running as plain Node and exiting. */
  startedAsApp: boolean;
  /** Null for an app the probe stopped. */
  exitCode: number | null;
  marker: boolean;
  /** The tail of what it printed, for a failure message to carry. */
  output: string;
};

/**
 * Starts `executable` as the suite launches the app, on a user data directory
 * of its own, waits until it has either exited or come up as Meru, or printed
 * `until` when given, then stops it and reports what it did.
 *
 * Coming up as Meru is the config being rewritten, which the main bundle does
 * as it loads. Node runs `--require`, a script argument and the inspector
 * before that bundle, so each has had its chance by then. Nothing waits for a
 * window.
 */
async function probe(
  executable: string,
  { dir, marker }: Probe,
  { args, env, until }: { args: string[]; env: Record<string, string>; until?: RegExp },
  gmailStandIn: TestServer,
): Promise<Outcome> {
  const userDataDir = await mkdtemp(path.join(dir, "profile-"));

  const configPath = path.join(userDataDir, "config.json");

  // What `useApp` seeds, for the same reason: no trial check against the API.
  const seed = JSON.stringify({ "trial.expired": true, "app.language": "en" });

  await writeFile(configPath, seed);

  await rm(marker, { force: true });

  /*
   * The user data directory goes after the arguments: in Node mode the first
   * argument that is not an option is the script, and everything after it is
   * the script's, where Node would refuse a Chromium switch it does not know.
   */
  const child = spawn(executable, [...args, ...launchArguments(userDataDir)], {
    cwd: dir,
    env: {
      ...process.env,
      MERU_TEST_BACKGROUND: "1",
      MERU_TEST_GMAIL_URL: gmailStandIn.gmailUrl,
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";

  const onData = (chunk: Buffer) => {
    output = (output + chunk.toString()).slice(-OUTPUT_CHARS_KEPT);
  };

  child.stdout.on("data", onData);

  child.stderr.on("data", onData);

  const closed = new Promise<void>((resolve) => {
    child.once("close", () => resolve());
  });

  const hasExited = () => child.exitCode !== null || child.signalCode !== null;

  const hasStartedAsApp = async () =>
    (await readFile(configPath, "utf8").catch(() => seed)) !== seed;

  let startedAsApp = false;

  try {
    const giveUpAt = Date.now() + STARTUP_TIMEOUT;

    while (!hasExited() && !(until ? until.test(output) : startedAsApp)) {
      if (Date.now() > giveUpAt) {
        throw new Error(
          `${executable} neither exited nor ${until ? `printed ${until}` : "came up as Meru"} within ${STARTUP_TIMEOUT}ms. It printed:\n${output}`,
        );
      }

      await sleep(POLL_INTERVAL);

      startedAsApp = await hasStartedAsApp();
    }

    startedAsApp = await hasStartedAsApp();
  } finally {
    await killTree(child);
  }

  // Every pipe drained, so the output holds all the process wrote.
  await closed;

  return {
    startedAsApp,
    exitCode: startedAsApp ? null : child.exitCode,
    marker: existsSync(marker),
    output,
  };
}

let gmailStandIn: TestServer;

let dir: string;

test.beforeAll(async () => {
  gmailStandIn = await startTestServer();
});

test.afterAll(async () => {
  await gmailStandIn?.close();
});

test.beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "meru-e2e-fuses-"));
});

test.afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

test.describe("fuses", () => {
  test("the build carries the release's fuses, but for the suite's own", async () => {
    const releaseFuses = await readReleaseFuses();

    const expected = { ...releaseFuses, ...E2E_FUSE_OVERRIDES };

    expect(
      await readFuses(fuseTarget(APP_ROOT, EXECUTABLE_PATH), Object.keys(expected)),
      `the fuses read from ${fuseTarget(APP_ROOT, EXECUTABLE_PATH)}, against package.json's build.electronFuses with scripts/lib/e2e-fuses.ts on top`,
    ).toEqual(expected);
  });

  test("ELECTRON_RUN_AS_NODE starts the app rather than Node", async () => {
    const releaseFuses = await readReleaseFuses();

    expect(releaseFuses.runAsNode, "runAsNode in the release's fuses").toBe(false);

    const probeFiles = await createProbe(dir);

    const launch = { args: [probeFiles.markerScript], env: { ELECTRON_RUN_AS_NODE: "1" } };

    const control = await probe(
      await copyApp(path.join(dir, "control"), { runAsNode: true }),
      probeFiles,
      launch,
      gmailStandIn,
    );

    expect(
      { startedAsApp: control.startedAsApp, exitCode: control.exitCode, marker: control.marker },
      `the control, runAsNode on, should run the script as Node and exit. It printed:\n${control.output}`,
    ).toEqual({ startedAsApp: false, exitCode: 0, marker: true });

    const shipped = await probe(EXECUTABLE_PATH, probeFiles, launch, gmailStandIn);

    expect(
      { startedAsApp: shipped.startedAsApp, marker: shipped.marker },
      `the build, runAsNode off, should come up as Meru without running the script. It printed:\n${shipped.output}`,
    ).toEqual({ startedAsApp: true, marker: false });
  });

  test("--inspect opens no inspector", async () => {
    const releaseFuses = await readReleaseFuses();

    expect(
      releaseFuses.enableNodeCliInspectArguments,
      "enableNodeCliInspectArguments in the release's fuses",
    ).toBe(false);

    const probeFiles = await createProbe(dir);

    const launch = { args: ["--inspect=0"], env: {} };

    const listening = /Debugger listening on/;

    // The suite's build is the control here, since it turns the fuse on.
    const control = await probe(EXECUTABLE_PATH, probeFiles, launch, gmailStandIn);

    expect(
      control.startedAsApp,
      `the control came up as Meru. It printed:\n${control.output}`,
    ).toBe(true);

    expect(control.output, "the control, inspect fuse on, should open an inspector").toMatch(
      listening,
    );

    const shipped = await probe(
      await copyApp(path.join(dir, "shipped"), {
        enableNodeCliInspectArguments: releaseFuses.enableNodeCliInspectArguments,
      }),
      probeFiles,
      launch,
      gmailStandIn,
    );

    expect(shipped.startedAsApp, `the build came up as Meru. It printed:\n${shipped.output}`).toBe(
      true,
    );

    expect(shipped.output, "the build, inspect fuse off, should open no inspector").not.toMatch(
      listening,
    );
  });

  test("NODE_OPTIONS is ignored", async () => {
    const releaseFuses = await readReleaseFuses();

    expect(
      releaseFuses.enableNodeOptionsEnvironmentVariable,
      "enableNodeOptionsEnvironmentVariable in the release's fuses",
    ).toBe(false);

    /*
     * Both sides run as Node, so each copy turns runAsNode on. Launched as the
     * app, a packaged build drops `--require` from NODE_OPTIONS whatever the
     * fuse, logging "Most NODE_OPTIONs are not supported in packaged apps", so
     * there the control would refuse it too and the check would prove nothing.
     */
    const probeFiles = await createProbe(dir);

    const launch = {
      args: [probeFiles.noopScript],
      env: {
        ELECTRON_RUN_AS_NODE: "1",
        NODE_OPTIONS: `--require=${JSON.stringify(probeFiles.markerScript)}`,
      },
    };

    const control = await probe(
      await copyApp(path.join(dir, "control"), {
        runAsNode: true,
        enableNodeOptionsEnvironmentVariable: true,
      }),
      probeFiles,
      launch,
      gmailStandIn,
    );

    expect(
      { startedAsApp: control.startedAsApp, exitCode: control.exitCode, marker: control.marker },
      `the control, NODE_OPTIONS fuse on, should require the script and exit. It printed:\n${control.output}`,
    ).toEqual({ startedAsApp: false, exitCode: 0, marker: true });

    const shipped = await probe(
      await copyApp(path.join(dir, "shipped"), {
        runAsNode: true,
        enableNodeOptionsEnvironmentVariable: releaseFuses.enableNodeOptionsEnvironmentVariable,
      }),
      probeFiles,
      launch,
      gmailStandIn,
    );

    expect(
      { startedAsApp: shipped.startedAsApp, exitCode: shipped.exitCode, marker: shipped.marker },
      `the build's NODE_OPTIONS fuse, off, should leave the script unrequired. It printed:\n${shipped.output}`,
    ).toEqual({ startedAsApp: false, exitCode: 0, marker: false });
  });
});

test.describe("swipe navigation addon", () => {
  test.skip(process.platform !== "darwin", "The addon is built for macOS alone");

  test("the app starts it", async () => {
    const settled = /Swipe navigation is (ready|unavailable)/;

    const launch = { args: [], env: {}, until: settled };

    const probeFiles = await createProbe(dir);

    // The control has no addon to load, so its failure line is what the check
    // has to be able to see.
    const control = await probe(
      await copyApp(
        path.join(dir, "control"),
        {},
        { remove: ["Contents/Resources/app.asar.unpacked/build-js/swipe-navigation.node"] },
      ),
      probeFiles,
      launch,
      gmailStandIn,
    );

    expect(
      control.output.match(settled)?.[0],
      `the control, without the addon, should log that swipe navigation is unavailable. It printed:\n${control.output}`,
    ).toBe("Swipe navigation is unavailable");

    const shipped = await probe(EXECUTABLE_PATH, probeFiles, launch, gmailStandIn);

    expect(
      shipped.output.match(settled)?.[0],
      `the build should log that swipe navigation is ready. It printed:\n${shipped.output}`,
    ).toBe("Swipe navigation is ready");
  });

  test.describe("its exports", () => {
    const meru = useApp();

    test("are what the app calls", async () => {
      // Type-checked against the addon's type, so an export added there is
      // asserted here too.
      const expected = {
        isSwipeTrackingEnabled: "function",
        start: "function",
        stop: "function",
        showOverlay: "function",
        hideOverlay: "function",
      } satisfies Record<keyof SwipeNavigationAddon, "function">;

      // The path `packages/app/swipe-navigation.ts` loads from, inside the asar,
      // which Electron sends to the unpacked copy.
      const exports = await meru.app.evaluate(({ app }) => {
        const addonModule = { exports: {} as Record<string, unknown> };

        process.dlopen(addonModule, `${app.getAppPath()}/build-js/swipe-navigation.node`);

        return Object.fromEntries(
          Object.entries(addonModule.exports).map(([name, value]) => [name, typeof value]),
        );
      });

      expect(exports, "the swipe navigation addon's exports, by type").toEqual(expected);
    });
  });
});
