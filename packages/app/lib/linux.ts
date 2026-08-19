import * as childProcess from "node:child_process";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { platform } from "@electron-toolkit/utils";

// Node types `execFile` as returning the ChildProcess, which `promisify`'s
// signature expects to be void.
// oxlint-disable-next-line typescript/strict-void-return
const execFile = promisify(childProcess.execFile);

let linuxWindowControlsEnabled: boolean | null = null;

async function getGtkDecorationLayout() {
  try {
    const { stdout: layout } = await execFile(
      "gsettings",
      ["get", "org.gnome.desktop.wm.preferences", "button-layout"],
      { timeout: 3000 },
    );

    return layout.trim().replaceAll(/^'|'$/g, "");
  } catch {
    // gsettings not available or schema not installed
  }

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
    } catch {}
  }

  return null;
}

export async function initLinuxWindowControls() {
  if (!platform.isLinux) {
    return;
  }

  const gtkDecorationLayout = await getGtkDecorationLayout();

  linuxWindowControlsEnabled =
    gtkDecorationLayout === null ? true : /close|minimize|maximize/.test(gtkDecorationLayout);
}

export function isLinuxWindowControlsEnabled() {
  if (!platform.isLinux) {
    throw new Error("isLinuxWindowControlsEnabled is only supported on Linux");
  }

  if (linuxWindowControlsEnabled === null) {
    throw new Error("initLinuxWindowControls must be called first");
  }

  return linuxWindowControlsEnabled;
}
