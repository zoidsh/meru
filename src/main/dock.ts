import { canHideDock, dockShown } from "#core/dock.ts";
import type { Dock } from "#platform/dock.ts";

import type { SettingsStore } from "./settings.ts";

export interface DockIconDeps {
  dock: Dock;
  settings: Pick<SettingsStore, "get" | "update" | "onChange">;
  /** After the icon comes back, whose badge the Dock may not have kept. */
  onShown: () => void;
  log: (message: string) => void;
}

/**
 * Shows or hides Meru's Dock icon as `dockIcon` says, at launch and on each
 * change, and turns the setting back on when the menu bar icon goes, so Meru
 * is never out of reach. A file with both off shows the icon and is left as
 * found until the person changes one of them. macOS alone.
 */
export const createDockIcon = ({
  dock,
  settings,
  onShown,
  log,
}: DockIconDeps) => {
  // A launch starts with the icon in the Dock.
  let shown = true;

  const apply = () => {
    const next = dockShown({
      dockIcon: settings.get("dockIcon"),
      tray: settings.get("tray"),
    });

    if (next === shown) {
      return;
    }

    shown = next;

    if (next) {
      dock.show();
      onShown();
    } else {
      dock.hide();
    }
  };

  const turnBackOn = async () => {
    try {
      await settings.update("dockIcon", () => true);
    } catch (error) {
      log(`Could not turn the Dock icon back on: ${String(error)}`);
    }
  };

  settings.onChange("dockIcon", apply);
  settings.onChange("tray", () => {
    apply();

    if (!settings.get("tray") && !settings.get("dockIcon")) {
      void turnBackOn();
    }
  });
  apply();

  return {
    /** Whether the icon is in the Dock now. */
    isShown: () => shown,
  };
};

/** Refuses a change that would leave neither the Dock nor the menu bar icon. */
export const assertDockChange = (
  settings: Pick<SettingsStore, "get">,
  dockIcon: boolean
) => {
  if (!dockIcon && !canHideDock({ tray: settings.get("tray") })) {
    throw new Error("The Dock icon cannot hide while the menu bar icon is off");
  }
};
