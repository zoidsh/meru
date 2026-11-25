import { t } from "@lingui/core/macro";
import type { MenuItemConstructorOptions } from "electron";

import type { Platform } from "#core/platform.ts";

/**
 * The labels a command and a native context menu item share, so the menu
 * bar and a tab's menu name it the same way: Title Case, as every native
 * menu is, prepositions and articles lower case as macOS writes them.
 */
export const MENU_LABELS = {
  reload: () =>
    t({
      message: "Reload",
      comment:
        "Menu item, in the View menu and a tab's context menu, that loads the page again",
    }),
  openAtLaunch: () =>
    t({
      message: "Open at Launch",
      comment:
        "Checkbox menu item, in the Tabs menu and a pinned tab's context menu: whether the tab loads when Meru starts rather than when first selected",
    }),
  bookmarkTab: () =>
    t({
      message: "Bookmark Tab",
      comment:
        "Menu item, in the Tabs menu and a tab's context menu, that saves the tab's page as a bookmark of its profile",
    }),
  removeBookmark: () =>
    t({
      message: "Remove Bookmark",
      comment:
        "Menu item, in the Tabs menu and a tab's context menu, in place of Bookmark Tab while the tab's page is bookmarked, that removes that bookmark",
    }),
  splitRight: () =>
    t({
      message: "Split Right",
      comment:
        "Menu item, in the Tabs menu and a tab's context menu, that lists Google apps and bookmarks to open in a new pane to the right of the tab's",
    }),
  splitDown: () =>
    t({
      message: "Split Down",
      comment:
        "Menu item, in the Tabs menu and a tab's context menu, that lists Google apps and bookmarks to open in a new pane below the tab's",
    }),
  maximizePane: () =>
    t({
      message: "Maximize Pane",
      comment:
        "Menu item, in the Tabs menu and a tab's context menu in a split view, that shows the pane alone, keeping the split",
    }),
  restorePanes: () =>
    t({
      message: "Restore Panes",
      comment:
        "Menu item, in the Tabs menu and a tab's context menu, in place of Maximize Pane while one pane shows alone, that shows every pane of the split again",
    }),
  separateFromSplit: () =>
    t({
      message: "Separate from Split",
      comment:
        "Menu item, in the Tabs menu and a tab's context menu, that takes the tab out of the split view, to show alone",
    }),
  moveToNewWindow: () =>
    t({
      message: "Move to New Window",
      comment:
        "Menu item, in the Tabs menu and a tab's context menu, that moves the tab's page into a window of its own, the tab staying in the sidebar",
    }),
  moveToMainWindow: () =>
    t({
      message: "Move to Main Window",
      comment:
        "Menu item, in the Tabs menu, a tab's context menu and More options of a tab's own window, that puts its page back in the main window and closes that window",
    }),
  closeTab: () =>
    t({
      message: "Close Tab",
      comment:
        "Menu item, in the Tabs menu and a tab's context menu, that closes the tab",
    }),
};

/**
 * A menu item disabled for the Meru Pro it needs: on macOS the label with a
 * Pro badge at its right, which macOS 14 and later draw; elsewhere, where
 * menus have no badge, the label with Pro after it.
 */
export const proMenuItem = (
  label: string,
  platform: Platform
): Pick<MenuItemConstructorOptions, "label" | "badge"> =>
  platform === "darwin"
    ? {
        label,
        badge: {
          type: "none",
          content: t({
            message: "Pro",
            comment:
              "Badge at the right of a disabled menu item on macOS on the free version, saying the item needs Meru Pro",
          }),
        },
      }
    : {
        label: t({
          message: `${label} (Pro)`,
          comment:
            "Label of a disabled menu item on Windows and Linux on the free version, saying it needs Meru Pro; {label} is the item's own label, such as Split Right",
        }),
      };
