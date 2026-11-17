import { app } from "electron";

export interface AppLifecycle {
  readonly name: string;
  /** Where this run keeps its data, a `--user-data-dir` given to it included. */
  readonly userDataPath: string;
  appendSwitch: (name: string, value?: string) => void;
  /** False when another instance already holds this user data directory. */
  requestSingleInstanceLock: () => boolean;
  whenReady: () => Promise<void>;
  onSecondInstance: (listener: () => void) => void;
  onWindowAllClosed: (listener: () => void) => void;
  /** macOS: the Dock icon clicked, or Meru opened again while it runs. */
  onActivate: (listener: () => void) => void;
  /** Also fires for a quit that SIGINT or SIGTERM starts. */
  onBeforeQuit: (listener: () => void) => void;
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
