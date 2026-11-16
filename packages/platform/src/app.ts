import { app } from "electron";

export interface AppLifecycle {
  readonly isPackaged: boolean;
  readonly name: string;
  readonly version: string;
  getPath: (name: "userData" | "appData") => string;
  /** Must run before the app is ready, while nothing has used the folder. */
  setUserDataPath: (dir: string) => void;
  /** A switch's value, empty when given bare, undefined when not given. */
  getSwitchValue: (name: string) => string | undefined;
  appendSwitch: (name: string, value?: string) => void;
  /** False when another instance already holds this user data directory. */
  requestSingleInstanceLock: () => boolean;
  whenReady: () => Promise<void>;
  onSecondInstance: (listener: () => void) => void;
  onWindowAllClosed: (listener: () => void) => void;
  /** Also fires for a quit that SIGINT or SIGTERM starts. */
  onBeforeQuit: (listener: () => void) => void;
  setAppUserModelId: (id: string) => void;
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
  get isPackaged() {
    return app.isPackaged;
  },
  get name() {
    return app.name;
  },
  get version() {
    return app.getVersion();
  },
  getPath: (name) => app.getPath(name),
  setUserDataPath: (dir) => app.setPath("userData", dir),
  getSwitchValue: (name) =>
    app.commandLine.hasSwitch(name)
      ? app.commandLine.getSwitchValue(name)
      : undefined,
  appendSwitch: (name, value) => app.commandLine.appendSwitch(name, value),
  requestSingleInstanceLock: () => app.requestSingleInstanceLock(),
  whenReady: () => app.whenReady(),
  onSecondInstance: (listener) => {
    app.on("second-instance", listener);
  },
  onWindowAllClosed: (listener) => {
    app.on("window-all-closed", listener);
  },
  onBeforeQuit: (listener) => {
    app.on("before-quit", listener);
  },
  setAppUserModelId: (id) => app.setAppUserModelId(id),
  preventActivation: () => {
    if (process.platform === "darwin") {
      app.setActivationPolicy("prohibited");
    }
  },
  quit: () => app.quit(),
  exit: (code) => app.exit(code),
});
