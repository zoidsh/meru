import { app } from "electron";

export interface AppLifecycle {
  readonly isPackaged: boolean;
  readonly name: string;
  getPath: (name: "userData" | "appData") => string;
  appendSwitch: (name: string, value?: string) => void;
  /** False when another instance already holds this user data directory. */
  requestSingleInstanceLock: () => boolean;
  whenReady: () => Promise<void>;
  onSecondInstance: (listener: () => void) => void;
  onWindowAllClosed: (listener: () => void) => void;
  /** Also fires for a quit that SIGINT or SIGTERM starts. */
  onBeforeQuit: (listener: () => void) => void;
  setAppUserModelId: (id: string) => void;
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
  getPath: (name) => app.getPath(name),
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
  quit: () => app.quit(),
  exit: (code) => app.exit(code),
});
