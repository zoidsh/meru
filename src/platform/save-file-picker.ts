import type { SaveDialog } from "./downloads.ts";
import type { AppWindow } from "./window.ts";

/** The system's Save dialog for a file of Meru's own, on the window that asked. */
export interface SaveFilePicker {
  /** The file chosen, or nothing when the dialog was canceled. */
  pick: (
    window: Pick<AppWindow, "pickSaveFile">,
    defaultPath: string
  ) => Promise<string | undefined>;
}

export const createSaveFilePicker = (): SaveFilePicker => ({
  pick: (window, defaultPath) => window.pickSaveFile(defaultPath),
});

/**
 * The end-to-end build's, answered by the same stand-in as a download's save
 * dialog, so a test sets one answer under `meruTestSaveDialog`.
 */
export const capturedSaveFilePicker = (dialog: SaveDialog): SaveFilePicker => ({
  pick: (_window, defaultPath) => Promise.resolve(dialog(defaultPath)),
});
