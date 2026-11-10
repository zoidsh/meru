/*
 * A window manager for the tests that need one, on Linux.
 *
 * Minimizing and maximizing are requests to the window manager on X11, and the
 * bare Xvfb the suite runs on has none, so there neither does anything. A file
 * that minimizes or maximizes calls `useWindowManagerDisplay()`, which gives each
 * of its tests an Xvfb of its own with openbox managing it. Its own rather than
 * one shared by the suite, because the workers share that one: under a window
 * manager their windows take focus from and stack over each other, which fails
 * the tests that read focus or visibility.
 *
 * Without Xvfb, openbox or xprop (from x11-utils) the tests that need one skip
 * locally and fail under CI, so CI cannot lose them unseen.
 */
import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { ms } from "@meru/shared/ms";
import { test } from "@playwright/test";
import { killProcessTree, readProcessTree, waitForProcessesToExit } from "./process-tree";

const START_TIMEOUT = ms("10s");

const POLL_INTERVAL = ms("100ms");

/** The window an EWMH window manager names as its own, or undefined when the property is unset. */
function readSupportingWindow(display: string, args: string[]) {
  const output = execFileSync("xprop", ["-display", display, ...args, "_NET_SUPPORTING_WM_CHECK"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });

  return /window id # (0x[0-9a-f]+)/i.exec(output)?.[1];
}

/** xprop exits non-zero with BadWindow when the window no longer exists. */
function readOwnSupportingWindow(display: string, supportingWindow: string) {
  try {
    return readSupportingWindow(display, ["-id", supportingWindow]);
  } catch {
    return undefined;
  }
}

/**
 * Why no window manager runs on the display, or undefined when one does.
 *
 * The root window's `_NET_SUPPORTING_WM_CHECK` names a window that carries the
 * same property naming itself, which is how EWMH says a manager is running:
 * one that exited leaves the root's property behind, pointing at a window
 * that is gone.
 */
function readMissingReason(display: string | undefined) {
  if (!display) {
    return "DISPLAY is not set";
  }

  try {
    const supportingWindow = readSupportingWindow(display, ["-root"]);

    if (!supportingWindow) {
      return `the root window of ${display} has no _NET_SUPPORTING_WM_CHECK`;
    }

    return readOwnSupportingWindow(display, supportingWindow) === supportingWindow
      ? undefined
      : `the window manager that set _NET_SUPPORTING_WM_CHECK on ${display} is gone`;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT"
      ? "xprop, from x11-utils, is not installed to ask"
      : `xprop could not read ${display}: ${(error as Error).message}`;
  }
}

const missingReasons = new Map<string | undefined, string | undefined>();

/**
 * Skips the test on Linux when no window manager runs on its display, or fails
 * it under CI. `action` names what needs one, as in "Minimizing the window".
 */
export function requireWindowManager(action: string) {
  if (process.platform !== "linux") {
    return;
  }

  const { DISPLAY } = process.env;

  if (!missingReasons.has(DISPLAY)) {
    missingReasons.set(DISPLAY, readMissingReason(DISPLAY));
  }

  const reason = missingReasons.get(DISPLAY);

  if (reason === undefined) {
    return;
  }

  const message = `${action} needs a window manager, and ${reason}. The file calls useWindowManagerDisplay(), which needs Xvfb, openbox and xprop installed`;

  if (process.env.CI) {
    throw new Error(message);
  }

  test.skip(true, message);
}

/**
 * Throws ENOENT, as a missing Xvfb or openbox does, when xprop is not there to
 * ask whether openbox has taken the display: `readMissingReason` turns that
 * into a reason, which would otherwise be waited on until the timeout.
 */
function assertXpropInstalled() {
  try {
    execFileSync("xprop", ["-version"], { stdio: "ignore" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw Object.assign(new Error("xprop, from x11-utils, is not installed"), {
        code: "ENOENT",
      });
    }
  }
}

function onceSpawned(child: ChildProcess) {
  return new Promise<void>((resolve, reject) => {
    child.once("spawn", resolve);

    child.once("error", reject);
  });
}

/** Starts Xvfb on a display number it picks itself, and resolves with that display. */
async function startXvfb(xvfb: ChildProcess) {
  await onceSpawned(xvfb);

  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Xvfb printed no display number within ${START_TIMEOUT}ms`));
    }, START_TIMEOUT);

    xvfb.stdout?.on("data", (chunk: Buffer) => {
      const match = /^(\d+)$/m.exec(chunk.toString());

      if (match) {
        clearTimeout(timer);

        resolve(`:${match[1]}`);
      }
    });

    xvfb.once("exit", (code) => {
      clearTimeout(timer);

      reject(new Error(`Xvfb exited with ${code} before it named its display`));
    });
  });
}

async function waitForWindowManager(display: string, openbox: ChildProcess) {
  const giveUpAt = Date.now() + START_TIMEOUT;

  // openbox announces itself through the property and no other way.
  for (;;) {
    const reason = readMissingReason(display);

    if (reason === undefined) {
      return;
    }

    if (openbox.exitCode !== null || openbox.signalCode !== null) {
      throw new Error(`openbox exited before it managed ${display}`);
    }

    if (Date.now() > giveUpAt) {
      throw new Error(`openbox did not manage ${display} within ${START_TIMEOUT}ms: ${reason}`);
    }

    await delay(POLL_INTERVAL);
  }
}

async function stop(children: ChildProcess[]) {
  for (const child of [...children].reverse()) {
    if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) {
      continue;
    }

    const tree = await readProcessTree(child.pid);

    await waitForProcessesToExit(await killProcessTree(tree));
  }
}

/**
 * Gives every test in the file an Xvfb of its own, managed by openbox, on
 * Linux, and does nothing elsewhere. Call it before `useApp` or
 * `useUnattachedApp`, since hooks run in the order they were registered and the
 * app has to launch onto this display.
 *
 * The display reaches the app through `DISPLAY` in the worker's environment,
 * which every launch copies. A worker runs one test at a time, so setting it
 * for the length of a test reaches only that test's app.
 *
 * Each display is taken down as the next test starts, or after the file, rather
 * than after its test: `afterEach` hooks also run in registration order, so
 * one here would pull the display from under an app the harness has yet to
 * close.
 */
export function useWindowManagerDisplay() {
  if (process.platform !== "linux") {
    return;
  }

  const sharedDisplay = process.env.DISPLAY;

  let children: ChildProcess[] = [];

  async function takeDown() {
    process.env.DISPLAY = sharedDisplay;

    await stop(children);

    children = [];
  }

  test.beforeEach(async () => {
    await takeDown();

    try {
      assertXpropInstalled();
    } catch (error) {
      if (!process.env.CI) {
        return;
      }

      throw error;
    }

    const xvfb = spawn(
      "Xvfb",
      ["-displayfd", "1", "-screen", "0", "1600x1000x24", "-nolisten", "tcp"],
      { stdio: ["ignore", "pipe", "ignore"] },
    );

    children = [xvfb];

    let display: string;

    try {
      display = await startXvfb(xvfb);

      const openbox = spawn("openbox", ["--sm-disable"], {
        env: { ...process.env, DISPLAY: display },
        stdio: "ignore",
      });

      children.push(openbox);

      await onceSpawned(openbox);

      await waitForWindowManager(display, openbox);
    } catch (error) {
      await takeDown();

      // Missing locally is a skip, which requireWindowManager says on the
      // shared display; anything else, or anything under CI, is a broken run.
      if ((error as NodeJS.ErrnoException).code === "ENOENT" && !process.env.CI) {
        return;
      }

      throw error;
    }

    process.env.DISPLAY = display;
  });

  test.afterAll(takeDown);
}
