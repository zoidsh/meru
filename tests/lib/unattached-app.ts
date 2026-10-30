/*
 * The app launched with no DevTools client on any of its pages, for a test that
 * reads whether a view is hidden.
 *
 * `useApp` cannot read that. Playwright attaches to every page it finds, account
 * views included, and turns on focus emulation in each one. Chromium implements
 * that by counting the page as captured, and a captured page reports
 * `document.visibilityState` "visible" whether it is on screen, covered or in a
 * hidden window. Electron's launcher has no way to turn the default off.
 *
 * So the app here is started the way `_electron.launch` starts it, minus the
 * browser's debugging port, and driven over its Node inspector alone: the main
 * process reads each view's state through `executeJavaScript`, which is no
 * DevTools session, and acts on the window and menus as a user would.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ms } from "@meru/shared/ms";
import type { Config } from "@meru/shared/types";
import { expect, test } from "@playwright/test";
import { EXECUTABLE_PATH, launchArguments } from "./app";
import { killProcessTree, readProcessTree, waitForProcessesToExit } from "./process-tree";
import { startTestServer, type TestServer } from "./server";

type Electron = typeof import("electron");

/*
 * Reached through `process.mainModule` rather than the inspector's own
 * `require`. Evaluated during startup, that one half-loads Node's `net`, after
 * which every `execFile` fails, the license check included.
 */
const ELECTRON = `process.mainModule.require("electron")`;

const INSPECTOR_TIMEOUT = ms("30s");

const QUIT_TIMEOUT = ms("15s");

const SECOND_INSTANCE_TIMEOUT = ms("30s");

// What a failure prints of the app's own output, which is the only account of a
// process nothing else is attached to.
const OUTPUT_LINES_KEPT = 200;

type InspectorReply = {
  id: number;
  result?: {
    result: { value?: unknown };
    exceptionDetails?: { exception?: { description?: string }; text: string };
  };
  error?: { message: string };
};

class Inspector {
  private nextId = 0;

  private pending = new Map<number, (reply: InspectorReply) => void>();

  private constructor(private socket: WebSocket) {
    socket.addEventListener("message", (event) => {
      const reply = JSON.parse(String(event.data)) as InspectorReply;

      this.pending.get(reply.id)?.(reply);

      this.pending.delete(reply.id);
    });

    socket.addEventListener("close", () => {
      for (const resolve of this.pending.values()) {
        resolve({ id: -1, error: { message: "The inspector closed" } });
      }

      this.pending.clear();
    });
  }

  static connect(url: string) {
    const socket = new WebSocket(url);

    return new Promise<Inspector>((resolve, reject) => {
      socket.addEventListener("open", () => resolve(new Inspector(socket)));

      socket.addEventListener("error", () => reject(new Error(`Could not connect to ${url}`)));
    });
  }

  async evaluate(expression: string) {
    const id = ++this.nextId;

    const reply = await new Promise<InspectorReply>((resolve) => {
      this.pending.set(id, resolve);

      this.socket.send(
        JSON.stringify({
          id,
          method: "Runtime.evaluate",
          params: {
            expression,
            awaitPromise: true,
            returnByValue: true,
          },
        }),
      );
    });

    if (reply.error) {
      throw new Error(reply.error.message);
    }

    const exception = reply.result?.exceptionDetails;

    if (exception) {
      throw new Error(exception.exception?.description ?? exception.text);
    }

    return reply.result?.result.value;
  }

  close() {
    this.socket.close();
  }
}

type Launched = {
  mainProcess: ChildProcess;
  inspector: Inspector;
  userDataDir: string;
  env: NodeJS.ProcessEnv;
  output: string[];
  secondInstances: ChildProcess[];
};

function hasExited(child: ChildProcess) {
  return child.exitCode !== null || child.signalCode !== null;
}

/** The exit code, or undefined when the process is still running at the timeout. */
function waitForExit(child: ChildProcess, timeout: number) {
  return new Promise<number | null | undefined>((resolve) => {
    if (hasExited(child)) {
      resolve(child.exitCode);

      return;
    }

    const timer = setTimeout(() => resolve(undefined), timeout);

    child.once("exit", (code) => {
      clearTimeout(timer);

      resolve(code);
    });
  });
}

async function killTree(child: ChildProcess) {
  if (hasExited(child)) {
    return;
  }

  const tree = await readProcessTree(child.pid as number);

  tree.push(...(await killProcessTree(tree)));

  await waitForProcessesToExit(tree);
}

function waitForInspectorUrl(mainProcess: ChildProcess, output: string[]) {
  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`The app printed no inspector URL within ${INSPECTOR_TIMEOUT}ms`));
    }, INSPECTOR_TIMEOUT);

    const onData = (chunk: Buffer) => {
      for (const line of chunk.toString().split("\n")) {
        output.push(line);

        const match = /^Debugger listening on (ws:\/\/\S+)/.exec(line);

        if (match?.[1]) {
          clearTimeout(timer);

          resolve(match[1]);
        }
      }

      output.splice(0, Math.max(0, output.length - OUTPUT_LINES_KEPT));
    };

    mainProcess.stdout?.on("data", onData);

    mainProcess.stderr?.on("data", onData);

    mainProcess.once("exit", (code) => {
      clearTimeout(timer);

      reject(new Error(`The app exited with ${code} before its inspector was listening`));
    });
  });
}

async function launch(seedConfig: Partial<Config>, gmailUrl: string): Promise<Launched> {
  const userDataDir = await mkdtemp(path.join(tmpdir(), "meru-e2e-"));

  // The same seed `useApp` writes, for the same reason: no trial check against
  // the API, and a native dialog waiting on nobody if it failed.
  await writeFile(
    path.join(userDataDir, "config.json"),
    JSON.stringify({ "trial.expired": true, ...seedConfig }, null, "\t"),
  );

  const env = { ...process.env, MERU_TEST_BACKGROUND: "1", MERU_TEST_GMAIL_URL: gmailUrl };

  const mainProcess = spawn(EXECUTABLE_PATH, ["--inspect=0", ...launchArguments(userDataDir)], {
    cwd: process.cwd(),
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const output: string[] = [];

  try {
    const inspector = await Inspector.connect(await waitForInspectorUrl(mainProcess, output));

    // Node holds a quitting process open for as long as a debugger is attached.
    const onData = (chunk: Buffer) => {
      if (chunk.toString().includes("Waiting for the debugger to disconnect")) {
        inspector.close();
      }
    };

    mainProcess.stdout?.on("data", onData);

    mainProcess.stderr?.on("data", onData);

    return { mainProcess, inspector, userDataDir, env, output, secondInstances: [] };
  } catch (error) {
    await killTree(mainProcess);

    await rm(userDataDir, { recursive: true, force: true });

    throw error;
  }
}

async function close({ mainProcess, inspector, userDataDir, secondInstances }: Launched) {
  for (const secondInstance of secondInstances) {
    await killTree(secondInstance);
  }

  if (!hasExited(mainProcess)) {
    const tree = await readProcessTree(mainProcess.pid as number);

    const exited = waitForExit(mainProcess, QUIT_TIMEOUT);

    // Not awaited: the reply can be lost with the process it came from.
    inspector.evaluate(`${ELECTRON}.app.quit()`).catch(() => undefined);

    if ((await exited) === undefined) {
      console.log(`[e2e] the app did not quit within ${QUIT_TIMEOUT}ms; killing it`);
    }

    // Also when it quit, for any helper the main process left behind.
    tree.push(...(await killProcessTree(tree)));

    await waitForProcessesToExit(tree);
  }

  inspector.close();

  await rm(userDataDir, { recursive: true, force: true });
}

export type UnattachedApp = {
  readonly userDataDir: string;
  /**
   * Runs `fn` in the main process with the `electron` module, as
   * `ElectronApplication.evaluate` does. It is sent as source, so it can close
   * over nothing but `arg`.
   */
  evaluate<R, A = undefined>(fn: (electron: Electron, arg: A) => R, arg?: A): Promise<Awaited<R>>;
  /**
   * Starts the executable again on the same user data directory, which loses
   * the single instance lock and hands over to this app through
   * `second-instance`, and resolves once that second process has exited.
   *
   * Started with this launch's environment, because a second instance that
   * wins the lock, as it does when the app under test has died, comes up as a
   * whole app: without it that one would load Gmail itself and could come to
   * the front on macOS.
   */
  launchSecondInstance(): Promise<void>;
};

/**
 * Launches the app for every test in the file, as `useApp` does, once its
 * window has loaded the renderer.
 */
export function useUnattachedApp(seedConfig: Partial<Config>): UnattachedApp {
  let gmailStandIn: TestServer | undefined;

  let launched: Launched | undefined;

  function current() {
    if (!launched) {
      throw new Error("The app has not been launched yet");
    }

    return launched;
  }

  test.beforeAll(async () => {
    gmailStandIn = await startTestServer();
  });

  test.afterAll(async () => {
    await gmailStandIn?.close();
  });

  const meru: UnattachedApp = {
    get userDataDir() {
      return current().userDataDir;
    },
    async evaluate(fn, arg) {
      return (await current().inspector.evaluate(
        `(${fn.toString()})(${ELECTRON}, ${JSON.stringify(arg) ?? "undefined"})`,
      )) as never;
    },
    async launchSecondInstance() {
      const { userDataDir, env, secondInstances } = current();

      const secondInstance = spawn(EXECUTABLE_PATH, launchArguments(userDataDir), {
        cwd: process.cwd(),
        env,
        stdio: "ignore",
      });

      secondInstances.push(secondInstance);

      const code = await waitForExit(secondInstance, SECOND_INSTANCE_TIMEOUT);

      if (code === undefined) {
        await killTree(secondInstance);

        throw new Error(
          `The second instance did not hand over and exit within ${SECOND_INSTANCE_TIMEOUT}ms`,
        );
      }

      // Losing the lock exits 0; anything else never got as far as handing over.
      expect(code, "the second instance's exit code").toBe(0);
    },
  };

  test.beforeEach(async () => {
    launched = await launch(seedConfig, (gmailStandIn as TestServer).gmailUrl);

    await expect
      .poll(() =>
        meru
          .evaluate(({ BrowserWindow }) => {
            const [window] = BrowserWindow.getAllWindows();

            return Boolean(
              window?.webContents.getURL().includes("main.html") && !window.webContents.isLoading(),
            );
          })
          .catch(() => false),
      )
      .toBe(true);
  });

  // oxlint-disable-next-line no-empty-pattern
  test.afterEach(async ({}, testInfo) => {
    // A launch that threw has cleaned up after itself, and its error is the one to see.
    if (!launched) {
      return;
    }

    const { output } = launched;

    if (testInfo.status !== testInfo.expectedStatus) {
      console.log(`[e2e] the app's output:\n${output.join("\n")}`);
    }

    try {
      await close(launched);
    } finally {
      launched = undefined;
    }
  });

  return meru;
}
