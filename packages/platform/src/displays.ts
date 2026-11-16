import type { Display } from "@meru/core/window-bounds";
import { screen } from "electron";

export interface Displays {
  getAll: () => Display[];
}

/** Only usable once the app is ready, as Electron's `screen` is. */
export const createDisplays = (): Displays => ({
  getAll: () => {
    const primaryId = screen.getPrimaryDisplay().id;

    return screen.getAllDisplays().map((display) => ({
      workArea: display.workArea,
      primary: display.id === primaryId,
    }));
  },
});
