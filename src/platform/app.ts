import { app } from "electron";
import { delay } from "es-toolkit";

export interface AppLifecycle {
  readonly name: string;
  /** Where this run keeps its data, a `--user-data-dir` given to it included. */
  readonly userDataPath: string;
  appendSwitch: (name: string, value?: string) => void;
  /** Only before the app is ready, for the whole run. */
  disableHardwareAcceleration: () => void;
  /** False when another instance already holds this user data directory. */
  requestSingleInstanceLock: () => boolean;
  whenReady: () => Promise<void>;
  onSecondInstance: (listener: () => void) => void;
  onWindowAllClosed: (listener: () => void) => void;
  /** macOS: the Dock icon clicked, or Meru opened again while it runs. */
  onActivate: (listener: () => void) => void;
  /** Also fires for a quit that SIGINT or SIGTERM starts. */
  onBeforeQuit: (listener: () => void) => void;
  /**
   * Holds a quit, once its windows have closed, until `work` settles or
   * `limitMs` passes, then quits; the quit's listeners run again then.
   */
  holdQuitFor: (work: () => Promise<unknown>, limitMs: number) => void;
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
  exit: (code: number) => void;
}

export const createAppLifecycle = (): AppLifecycle => ({
  get name() {
    return app.name;
  },
  get userDataPath() {
    return app.getPath("userData");
  },
  appendSwitch: (name, value) => app.commandLine.appendSwitch(name, value),
  disableHardwareAcceleration: () => {
    app.disableHardwareAcceleration();
  },
  requestSingleInstanceLock: () => app.requestSingleInstanceLock(),
  whenReady: () => app.whenReady(),
  onSecondInstance: (listener) => {
    app.on("second-instance", listener);
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
          app.quit();
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
  quit: () => app.quit(),
  exit: (code) => app.exit(code),
});
