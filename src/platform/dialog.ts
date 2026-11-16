import { dialog } from "electron";

export interface ErrorDialog {
  /** Blocks until dismissed. Safe before the app is ready. */
  show: (title: string, message: string) => void;
}

export const createErrorDialog = (): ErrorDialog => ({
  show: (title, message) => dialog.showErrorBox(title, message),
});
