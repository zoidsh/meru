import { platform } from "@electron-toolkit/utils";
import { app } from "electron";

/**
 * Both the AppImage and the Windows portable build run Meru from a temporary
 * mount or extraction that their launcher removes once the process exits, so
 * `process.execPath` is gone by the time the relauncher execs it. The launcher
 * exports the path of the file the user ran, which survives the restart.
 */
export function relaunchApp() {
  const execPath = platform.isLinux
    ? process.env.APPIMAGE
    : platform.isWindows
      ? process.env.PORTABLE_EXECUTABLE_FILE
      : undefined;

  if (execPath) {
    app.relaunch({ execPath, args: process.argv.slice(1) });

    return;
  }

  app.relaunch();
}
