import { app } from "electron";
import { delay } from "es-toolkit";

import { relaunchOptions } from "#core/executable.ts";

export interface AppLifecycle {
  readonly name: string;
  /** Where this run keeps its data, a `--user-data-dir` given to it included. */
  readonly userDataPath: string;
  /** Where the app's own code is. */
  readonly appPath: string;
  readonly version: string;
  appendSwitch: (name: string, value?: string) => void;
  /** Only before the app is ready, for the whole run. */
  disableHardwareAcceleration: () => void;
  /** False when another instance already holds this user data directory. */
  requestSingleInstanceLock: () => boolean;
  whenReady: () => Promise<void>;
  /** The second launch's arguments, which carry a link it was opened with. */
  onSecondInstance: (listener: (argv: readonly string[]) => void) => void;
  /** This launch's arguments, which carry a link it was opened with. */
  readonly launchArgv: readonly string[];
  /**
   * macOS: a link the system hands Meru, the one that launched it included,
   * so it is listened for before `ready`.
   */
  onOpenUrl: (listener: (url: string) => void) => void;
  onWindowAllClosed: (listener: () => void) => void;
  /** macOS: the Dock icon clicked, or Meru opened again while it runs. */
  onActivate: (listener: () => void) => void;
  /** Also fires for a quit that SIGINT or SIGTERM starts. */
  onBeforeQuit: (listener: () => void) => void;
  /**
   * Holds a quit, once its windows have closed, until `work` settles or
   * `limitMs` passes, then quits, or calls what `quitThen` was given in its
   * place; the quit's listeners run again then.
   */
  holdQuitFor: (work: () => Promise<unknown>, limitMs: number) => void;
  /**
   * Quits as `quit` does, held as it is, then calls `finish` in place of the
   * last quit, which `finish` must make; a second call while one is under
   * way does nothing.
   */
  quitThen: (finish: () => void) => void;
  setAppUserModelId: (id: string) => void;
  /** The system's languages, most preferred first. */
  preferredLanguages: () => string[];
  /**
   * On macOS, keeps the app out of the Dock and from ever becoming the active
   * app, whatever later shows or focuses a window. Elsewhere nothing: a window
   * shown inactive takes no focus there.
   */
  preventActivation: () => void;
  quit: () => void;
  /**
   * Quits as `quit` does and starts Meru again once this run has exited,
   * from the file the person started, with this run's arguments, so a run on
   * another user data folder comes back on it.
   */
  relaunch: () => void;
  exit: (code: number) => void;
}

/**
 * The end-to-end build's relaunch, which starts nothing: it says so on main's
 * log, which a test reads once the app is gone and which a pipe on macOS
 * writes asynchronously, then ends the app at once, as the captured updater's
 * install does, and the test launches again on the same folder.
 */
export const capturedRelaunch = () => {
  process.stderr.write(
    `meruTestRelaunch: relaunch ${JSON.stringify(process.argv.slice(1))}\n`,
    () => {
      app.exit(0);
    }
  );
};

export const createAppLifecycle = (): AppLifecycle => {
  let finishQuit: (() => void) | undefined;

  return {
    get name() {
      return app.name;
    },
    get userDataPath() {
      return app.getPath("userData");
    },
    get appPath() {
      return app.getAppPath();
    },
    get version() {
      return app.getVersion();
    },
    appendSwitch: (name, value) => app.commandLine.appendSwitch(name, value),
    disableHardwareAcceleration: () => {
      app.disableHardwareAcceleration();
    },
    requestSingleInstanceLock: () => app.requestSingleInstanceLock(),
    whenReady: () => app.whenReady(),
    onSecondInstance: (listener) => {
      app.on("second-instance", (_event, argv) => {
        listener(argv);
      });
    },
    launchArgv: process.argv,
    onOpenUrl: (listener) => {
      app.on("open-url", (event, url) => {
        event.preventDefault();
        listener(url);
      });
    },
    onWindowAllClosed: (listener) => {
      app.on("window-all-closed", listener);
    },
    onActivate: (listener) => {
      app.on("activate", listener);
    },
    onBeforeQuit: (listener) => {
      app.on("before-quit", listener);
    },
    holdQuitFor: (work, limitMs) => {
      let held = false;

      app.on("will-quit", (event) => {
        if (held) {
          return;
        }

        held = true;
        event.preventDefault();
        void (async () => {
          await Promise.race([
            work().catch(() => false),
            // A write that hangs never keeps Meru from quitting.
            delay(limitMs),
          ]);
          // Electron ignores a quit asked for in the turn whose quit was held.
          setTimeout(() => {
            const finish = finishQuit ?? (() => app.quit());

            finishQuit = undefined;
            finish();
          }, 0);
        })();
      });
    },
    setAppUserModelId: (id) => app.setAppUserModelId(id),
    preferredLanguages: () => app.getPreferredSystemLanguages(),
    preventActivation: () => {
      if (process.platform === "darwin") {
        app.setActivationPolicy("prohibited");
      }
    },
    quitThen: (finish) => {
      if (finishQuit) {
        return;
      }

      finishQuit = finish;
      app.quit();
    },
    quit: () => app.quit(),
    relaunch: () => {
      app.relaunch(
        relaunchOptions({
          env: process.env,
          execPath: process.execPath,
          argv: process.argv,
        })
      );
      app.quit();
    },
    exit: (code) => app.exit(code),
  };
};
