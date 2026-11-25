import { app } from "electron";

/** Meru's icon in the macOS Dock. */
export interface Dock {
  /** Settles once Electron has made Meru a regular app again. */
  show: () => Promise<void>;
  hide: () => void;
}

/**
 * The Dock itself. Hiding turns Meru into an accessory app, out of the Dock
 * and Cmd+Tab, with no menu bar of its own; showing turns it back. Electron's
 * `show()` activates Meru only when it is already the active app, which it
 * then briefly hands to the Dock and takes back. A hide within a second of a
 * show does nothing in Electron, which `createDockIcon` makes up for.
 */
export const createDock = (): Dock => ({
  show: async () => {
    await app.dock?.show();
  },
  hide: () => {
    app.dock?.hide();
  },
});

/**
 * The end-to-end build's Dock, which never changes the real one on the
 * desktop the suite shares. Each call is on the main process's global under
 * `meruTestDock`, oldest first.
 */
export const createCapturedDock = (): Dock => {
  const calls: ("show" | "hide")[] = [];

  Reflect.set(globalThis, "meruTestDock", calls);

  return {
    show: () => {
      calls.push("show");

      return Promise.resolve();
    },
    hide: () => {
      calls.push("hide");
    },
  };
};
