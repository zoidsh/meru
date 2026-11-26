import { shell } from "electron";

/** Opens a file in the system's handler for its kind, as a double click does. */
export interface PathOpener {
  /** Rejects with the system's reason when it could not be opened. */
  open: (path: string) => Promise<void>;
}

export const createPathOpener = (): PathOpener => ({
  open: async (path) => {
    const failure = await shell.openPath(path);

    if (failure !== "") {
      throw new Error(failure);
    }
  },
});

/** Each path the end-to-end build would have opened, in order. */
export interface CapturedPathOpener {
  opened: string[];
}

/**
 * The end-to-end build's, which opens nothing; what would have been is on
 * the main process's global under `meruTestPathOpener`.
 */
export const createCapturedPathOpener = (): PathOpener => {
  const captured: CapturedPathOpener = { opened: [] };

  Reflect.set(globalThis, "meruTestPathOpener", captured);

  return {
    open: (path) => {
      captured.opened.push(path);

      return Promise.resolve();
    },
  };
};
