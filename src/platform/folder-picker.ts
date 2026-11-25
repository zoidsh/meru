import type { AppWindow } from "./window.ts";

/** The system's folder picker, on the window that asked. */
export interface FolderPicker {
  /** The folder chosen, or nothing when the picker was cancelled. */
  pick: (
    window: Pick<AppWindow, "pickFolder">,
    defaultPath: string
  ) => Promise<string | undefined>;
}

export const createFolderPicker = (): FolderPicker => ({
  pick: (window, defaultPath) => window.pickFolder(defaultPath),
});

/**
 * What the end-to-end build's picker answers, set by the test, and the
 * folder it opened at each time; on the main process's global under
 * `meruTestFolderPicker`. `null` answers as Cancel does.
 */
export interface CapturedFolderPicker {
  answer: string | null;
  asked: string[];
}

/** The end-to-end build's, which never puts a picker on the screen. */
export const createCapturedFolderPicker = (): FolderPicker => {
  const captured: CapturedFolderPicker = { answer: null, asked: [] };

  Reflect.set(globalThis, "meruTestFolderPicker", captured);

  return {
    pick: (_window, defaultPath) => {
      captured.asked.push(defaultPath);

      return Promise.resolve(captured.answer ?? undefined);
    },
  };
};
