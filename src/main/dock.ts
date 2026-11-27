import { delay } from "es-toolkit";

import { canHideDock, dockShown } from "#core/dock.ts";
import { scrub } from "#core/log.ts";
import type { Log } from "#core/log.ts";
import type { Dock } from "#platform/dock.ts";

import type { SettingsStore } from "./settings.ts";

/**
 * Electron ignores a hide within a second of a show (`Browser::DockHide`),
 * which keeps macOS from leaving two icons in the Dock. A little over it, so
 * a hide asked for in that second is made once it has passed.
 */
export const DOCK_SHOW_SETTLES_MS = 1100;

export interface DockIconDeps {
  dock: Dock;
  settings: Pick<SettingsStore, "get" | "update" | "onChange">;
  /** After the icon comes back, whose badge the Dock may not have kept. */
  onShown: () => void;
  log: Log;
}

/**
 * Shows or hides Meru's Dock icon as `dockIcon` says, at launch and on each
 * change, and turns the setting back on when the menu bar icon goes, so Meru
 * is never out of reach. A file with both off shows the icon and is left as
 * found until the menu bar icon changes. macOS alone.
 */
export const createDockIcon = ({
  dock,
  settings,
  onShown,
  log,
}: DockIconDeps) => {
  // A launch starts with the icon in the Dock.
  let shown = true;

  const wanted = () =>
    dockShown({
      dockIcon: settings.get("dockIcon"),
      tray: settings.get("tray"),
    });

  const show = async () => {
    try {
      await dock.show();
      onShown();
      await delay(DOCK_SHOW_SETTLES_MS);

      if (!wanted()) {
        dock.hide();
      }
    } catch (error) {
      log("dock-icon-show-failed", { error: scrub.error(error) });
    }
  };

  const apply = () => {
    const next = wanted();

    if (next === shown) {
      return;
    }

    shown = next;

    if (next) {
      void show();
    } else {
      dock.hide();
    }
  };

  const turnBackOn = async () => {
    try {
      await settings.update("dockIcon", () => true);
    } catch (error) {
      log("dock-icon-restore-failed", { error: scrub.error(error) });
    }
  };

  settings.onChange("dockIcon", apply);
  settings.onChange("tray", () => {
    if (settings.get("dockIcon")) {
      apply();

      return;
    }

    // The pair was both off before this change or is now, while the page's
    // switch read on; the setting is made what the switch said, so turning
    // the menu bar icon on never hides a Dock icon nobody turned off.
    if (!settings.get("tray")) {
      apply();
    }

    void turnBackOn();
  });
  apply();

  return {
    /** Whether the icon is in the Dock now. */
    isShown: () => shown,
  };
};

/**
 * The value to store for `dockIcon`, run inside the store's queue so it reads
 * `tray` after every change queued before it; refuses one that would leave
 * neither the Dock nor the menu bar icon.
 */
export const checkedDockChange =
  (settings: Pick<SettingsStore, "get">, dockIcon: boolean) => () => {
    if (!dockIcon && !canHideDock({ tray: settings.get("tray") })) {
      throw new Error(
        "The Dock icon cannot hide while the menu bar icon is off"
      );
    }

    return dockIcon;
  };
