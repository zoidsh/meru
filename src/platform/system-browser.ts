import { shell } from "electron";

export interface SystemBrowser {
  open: (url: string) => Promise<void>;
}

export const createSystemBrowser = (): SystemBrowser => ({
  open: (url) => shell.openExternal(url),
});

/**
 * The end-to-end build's, from launch: it records each URL on the main
 * process's global under `meruTestOpenedExternally` and opens nothing, so no
 * test reaches the default browser or the system's mail app, whether or not
 * it reads what was opened.
 */
export const createCapturedSystemBrowser = (): SystemBrowser => {
  Reflect.set(globalThis, "meruTestOpenedExternally", []);

  return {
    open: (url) => {
      (Reflect.get(globalThis, "meruTestOpenedExternally") as string[]).push(
        url
      );

      return Promise.resolve();
    },
  };
};
