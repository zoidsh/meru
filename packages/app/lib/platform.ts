import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Reads the effective `gtk-decoration-layout`, checking GSettings first
 * (the authoritative source on most desktops), then falling back to
 * GTK settings files.
 */
function getGtkDecorationLayout(): string | null {
  try {
    const layout = execFileSync(
      "gsettings",
      ["get", "org.gnome.desktop.wm.preferences", "button-layout"],
      { encoding: "utf8", timeout: 1000 },
    ).trim();

    // gsettings wraps the value in single quotes
    return layout.replace(/^'|'$/g, "");
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
      const content = readFileSync(file, "utf8");
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

/**
 * Returns whether CSD window control buttons (close, minimize, maximize)
 * should be shown, based on the `gtk-decoration-layout` setting.
 */
export function shouldShowWindowControls(): boolean {
  const layout = getGtkDecorationLayout();

  if (layout === null) {
    return true;
  }

  return /close|minimize|maximize/.test(layout);
}
