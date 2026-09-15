import * as childProcess from "node:child_process";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { platform } from "@electron-toolkit/utils";
import { ms } from "@meru/shared/ms";
import type { Config } from "@meru/shared/types";
import { config } from "@/config";
import { log } from "./log";

const execFile = promisify(childProcess.execFile);

const SUBPROCESS_TIMEOUT = ms("3s");

const TILING_WINDOW_MANAGERS = [
  "i3",
  "ion3",
  "notion",
  "ratpoison",
  "stumpwm",
  "awesome",
  "qtile",
  "xmonad",
  "wmii",
  "dwm",
  "bspwm",
  "herbstluftwm",
  "sway",
  "hyprland",
  "river",
  "niri",
  "leftwm",
  "spectrwm",
];

const STACKING_WINDOW_MANAGERS = [
  "kwin",
  "mutter",
  "gnome shell",
  "xfwm4",
  "openbox",
  "marco",
  "metacity",
  "muffin",
  "fluxbox",
  "icewm",
  "enlightenment",
  "blackbox",
  "compiz",
  "matchbox",
];

/**
 * Window manager names carry suffixes and casing of their own, so `KWin`,
 * `i3-gaps` and `Mutter (X11)` all have to hit. Word boundaries keep a short
 * name from matching inside a longer one.
 */
function matchesWindowManager(value: string, names: string[]) {
  return names.some((name) => new RegExp(`\\b${name}\\b`, "i").test(value));
}

let linuxWindowControlsEnabled: boolean | null = null;

export type LinuxWindowControlsSignals = {
  windowManagerName: string | null;
  desktops: string[];
  desktopSession: string | null;
  hasSwaySocket: boolean;
  hasHyprlandSignature: boolean;
  hasI3Socket: boolean;
  gtkDecorationLayout: string | null;
};

async function getWindowManagerName() {
  // `xprop` reads the X server to talk to from `DISPLAY`, so without it the two
  // calls below are a guaranteed failure that still costs two process spawns.
  if (!process.env.DISPLAY) {
    return null;
  }

  try {
    const { stdout: supportingWindow } = await execFile(
      "xprop",
      ["-root", "-notype", "_NET_SUPPORTING_WM_CHECK"],
      { timeout: SUBPROCESS_TIMEOUT },
    );

    const windowId = supportingWindow.match(/0x[0-9a-f]+/i)?.[0];

    if (!windowId) {
      return null;
    }

    const { stdout: windowName } = await execFile(
      "xprop",
      ["-id", windowId, "-notype", "_NET_WM_NAME"],
      { timeout: SUBPROCESS_TIMEOUT },
    );

    return windowName.match(/"(.*)"/)?.[1] ?? null;
  } catch {
    return null;
  }
}

function getEnvironmentSignals() {
  return {
    desktops: process.env.XDG_CURRENT_DESKTOP?.split(":").filter(Boolean) ?? [],
    desktopSession: process.env.DESKTOP_SESSION ?? null,
    hasSwaySocket: Boolean(process.env.SWAYSOCK),
    hasHyprlandSignature: Boolean(process.env.HYPRLAND_INSTANCE_SIGNATURE),
    hasI3Socket: Boolean(process.env.I3SOCK),
  };
}

async function getGtkDecorationLayout() {
  try {
    const { stdout: layout } = await execFile(
      "gsettings",
      ["get", "org.gnome.desktop.wm.preferences", "button-layout"],
      { timeout: SUBPROCESS_TIMEOUT },
    );

    return layout.trim().replace(/^'|'$/g, "");
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

export function resolveLinuxWindowControls(
  signals: LinuxWindowControlsSignals,
  setting: Config["window.linuxWindowControls"],
) {
  if (setting === "show") {
    return true;
  }

  if (setting === "hide") {
    return false;
  }

  const resolveFromGtkDecorationLayout = () =>
    // No layout at all is no evidence either way, and a desktop that draws
    // decorations is the far more common case to be wrong about.
    signals.gtkDecorationLayout === null ||
    /close|minimize|maximize/.test(signals.gtkDecorationLayout);

  if (signals.windowManagerName) {
    if (matchesWindowManager(signals.windowManagerName, TILING_WINDOW_MANAGERS)) {
      return false;
    }

    if (matchesWindowManager(signals.windowManagerName, STACKING_WINDOW_MANAGERS)) {
      return resolveFromGtkDecorationLayout();
    }
  }

  if (signals.hasSwaySocket || signals.hasHyprlandSignature || signals.hasI3Socket) {
    return false;
  }

  const desktopNames = signals.desktopSession
    ? [...signals.desktops, signals.desktopSession]
    : signals.desktops;

  if (desktopNames.some((name) => matchesWindowManager(name, TILING_WINDOW_MANAGERS))) {
    return false;
  }

  return resolveFromGtkDecorationLayout();
}

export async function initLinuxWindowControls() {
  if (!platform.isLinux) {
    return;
  }

  const [windowManagerName, environmentSignals, gtkDecorationLayout] = await Promise.all([
    getWindowManagerName(),
    getEnvironmentSignals(),
    getGtkDecorationLayout(),
  ]);

  const signals = { windowManagerName, ...environmentSignals, gtkDecorationLayout };

  const setting = config.get("window.linuxWindowControls");

  linuxWindowControlsEnabled = resolveLinuxWindowControls(signals, setting);

  log.debug("Resolved Linux window controls", {
    ...signals,
    setting,
    enabled: linuxWindowControlsEnabled,
  });
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
