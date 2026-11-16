import { app } from "electron";

export interface AppLifecycle {
  readonly isPackaged: boolean;
  hasSwitch: (name: string) => boolean;
  appendSwitch: (name: string, value?: string) => void;
  /** False when another instance already holds this user data directory. */
  requestSingleInstanceLock: () => boolean;
  whenReady: () => Promise<void>;
  onSecondInstance: (listener: () => void) => void;
  onWindowAllClosed: (listener: () => void) => void;
  setAppUserModelId: (id: string) => void;
  quit: () => void;
  exit: (code: number) => void;
}

export const createAppLifecycle = (): AppLifecycle => ({
  get isPackaged() {
    return app.isPackaged;
  },
  hasSwitch: (name) => app.commandLine.hasSwitch(name),
  appendSwitch: (name, value) => app.commandLine.appendSwitch(name, value),
  requestSingleInstanceLock: () => app.requestSingleInstanceLock(),
  whenReady: () => app.whenReady(),
  onSecondInstance: (listener) => {
    app.on("second-instance", listener);
  },
  onWindowAllClosed: (listener) => {
    app.on("window-all-closed", listener);
  },
  setAppUserModelId: (id) => app.setAppUserModelId(id),
  quit: () => app.quit(),
  exit: (code) => app.exit(code),
});
