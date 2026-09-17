import { platform } from "@electron-toolkit/utils";
import type { SystemColors } from "@meru/shared/types";
import { systemPreferences } from "electron";

type SystemColorName = Parameters<typeof systemPreferences.getColor>[0];

// The semantic AppKit colors Finder and Chrome draw their own chrome from,
// mapped onto the shadcn tokens the renderer already styles against. Apple
// resolves each one against the effective appearance, the accent color and
// Increase Contrast, so none of them can be frozen into the stylesheet.
const SEMANTIC_COLORS = {
  "--background": "window-background",
  "--sidebar": "window-background",
  "--card": "control-background",
  "--popover": "control-background",
  "--foreground": "text",
  "--card-foreground": "text",
  "--popover-foreground": "text",
  "--sidebar-foreground": "text",
  "--muted-foreground": "secondary-label",
  "--border": "separator",
  "--sidebar-border": "separator",
  "--input": "separator",
  "--muted": "unemphasized-selected-content-background",
  "--accent": "unemphasized-selected-content-background",
  "--sidebar-accent": "unemphasized-selected-content-background",
  "--accent-foreground": "unemphasized-selected-text",
  "--sidebar-accent-foreground": "unemphasized-selected-text",
  "--primary": "selected-content-background",
  "--sidebar-primary": "selected-content-background",
  "--primary-foreground": "selected-menu-item-text",
  "--sidebar-primary-foreground": "selected-menu-item-text",
  "--ring": "keyboard-focus-indicator",
  "--sidebar-ring": "keyboard-focus-indicator",
} as const satisfies Record<string, SystemColorName>;

export const isSystemColorsEnabled = platform.isMacOS && process.env.MERU_SYSTEM_COLORS !== "0";

export function getSystemColors(): SystemColors {
  if (!isSystemColorsEnabled) {
    return null;
  }

  return Object.fromEntries(
    Object.entries(SEMANTIC_COLORS).map(([variable, color]) => [
      variable,
      systemPreferences.getColor(color),
    ]),
  );
}

// `backgroundColor` and the titlebar overlay composite against the desktop
// rather than another layer, so they need the opaque prefix of a value that
// AppKit hands back as `#RRGGBBAA`.
export function getSystemWindowBackgroundColor() {
  if (!isSystemColorsEnabled) {
    return null;
  }

  return systemPreferences.getColor("window-background").slice(0, 7);
}
