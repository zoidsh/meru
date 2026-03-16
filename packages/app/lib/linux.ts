import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

function getGtkDecorationLayout(): string | null {
  try {
    const layout = execFileSync(
      "gsettings",
      ["get", "org.gnome.desktop.wm.preferences", "button-layout"],
      { encoding: "utf8", timeout: 1000 },
    ).trim();

    return layout.replace(/^'|'$/g, "");
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

export function shouldShowWindowControls(): boolean {
  const layout = getGtkDecorationLayout();

  if (layout === null) {
    return true;
  }

  return /close|minimize|maximize/.test(layout);
}
