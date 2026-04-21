import { platform } from "@electron-toolkit/utils";
import * as childProcess from "node:child_process";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFile = promisify(childProcess.execFile);

let cachedIsLinuxWindowControlsEnabled: boolean | null = null;

async function getGtkDecorationLayout() {
  try {
    const { stdout: layout } = await execFile(
      "gsettings",
      ["get", "org.gnome.desktop.wm.preferences", "button-layout"],
      { timeout: 3000 },
    );

    return layout.trim().replace(/^'|'$/g, "");
  } catch {
    // gsettings not available or schema not installed
  }

  // Fallback
  const settingsFiles = [
    join(homedir(), ".config", "gtk-3.0", "settings.ini"),
    join(homedir(), ".config", "gtk-4.0", "settings.ini"),
    "/etc/gtk-3.0/settings.ini",
    "/etc/gtk-4.0/settings.ini",
  ];

  for (const file of settingsFiles) {
    try {
      const content = await readFile(file, "utf8");
      const match = content.match(/gtk-decoration-layout\s*=\s*(.*)/);

      if (match?.[1]) {
        return match[1].trim();
      }
    } catch {
      // File doesn't exist or can't be read
    }
  }

  return null;
}

export async function isLinuxWindowControlsEnabled() {
  if (!platform.isLinux) {
    throw new Error("isLinuxWindowControlsEnabled is only supported on Linux");
  }

  if (typeof cachedIsLinuxWindowControlsEnabled === "boolean") {
    return cachedIsLinuxWindowControlsEnabled;
  }

  const gtkDecorationLayout = await getGtkDecorationLayout();

  cachedIsLinuxWindowControlsEnabled =
    gtkDecorationLayout === null ? true : /close|minimize|maximize/.test(gtkDecorationLayout);

  return cachedIsLinuxWindowControlsEnabled;
}
