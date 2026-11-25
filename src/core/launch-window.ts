import type { Platform } from "./platform.ts";
import { closeHides } from "./tray.ts";

/** How the main window first appears as Meru starts. */
export type LaunchWindow = "shown" | "hidden" | "minimized";

/**
 * Shown, unless Open in the background is on: then hidden where something
 * brings it back, as closing it hides it there (the Dock or menu bar on
 * macOS, the tray elsewhere), else minimized to the taskbar, so Meru is
 * never out of reach.
 */
export const launchWindow = ({
  openInBackground,
  platform,
  trayShown,
}: {
  openInBackground: boolean;
  platform: Platform;
  trayShown: boolean;
}): LaunchWindow => {
  if (!openInBackground) {
    return "shown";
  }

  return closeHides({ platform, trayShown, quitting: false })
    ? "hidden"
    : "minimized";
};
