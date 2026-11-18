import { Menu } from "electron";
import type { BaseWindow, MenuItemConstructorOptions } from "electron";

/** An item of a native menu, its label already in the person's language. */
export type ContextMenuItem =
  | {
      label: string;
      enabled: boolean;
      /** A checkbox item's state; none for an item that is not one. */
      checked?: boolean;
      /**
       * The shortcut it shows, an Electron accelerator. Shown only: the
       * registry's commands hear the keys, so a menu never registers it.
       */
      accelerator?: string;
      /** None for a line that only says something; what it gives is ignored. */
      click?: () => unknown;
    }
  | { type: "separator" };

/** Where a menu opens, in the window's content area; else at the pointer. */
export interface MenuPoint {
  x: number;
  y: number;
}

export interface ContextMenus {
  /** Pops the menu up in `window`, at `at` or at the pointer. */
  popup: (
    window: BaseWindow,
    items: readonly ContextMenuItem[],
    at?: MenuPoint
  ) => void;
}

const template = (item: ContextMenuItem): MenuItemConstructorOptions => {
  if ("type" in item) {
    return { type: "separator" };
  }

  return {
    label: item.label,
    enabled: item.enabled,
    ...(item.checked !== undefined && {
      type: "checkbox" as const,
      checked: item.checked,
    }),
    ...(item.accelerator !== undefined && {
      accelerator: item.accelerator,
      registerAccelerator: false,
    }),
    ...(item.click && { click: item.click }),
  };
};

/** Native menus, as the system draws them. */
export const createContextMenus = (): ContextMenus => ({
  popup: (window, items, at) => {
    Menu.buildFromTemplate(items.map(template)).popup({
      window,
      ...(at && { x: at.x, y: at.y }),
    });
  },
});

/** A menu the end-to-end build popped up, as a test reads and chooses from it. */
interface CapturedContextMenu {
  /** The window's id, as `BaseWindow.fromId` takes it. */
  windowId: number;
  at: MenuPoint | null;
  items: (
    | {
        label: string;
        enabled: boolean;
        checked: boolean | null;
        accelerator: string | null;
      }
    | { separator: true }
  )[];
  /** Clicks the enabled item with this label, as choosing it would. */
  choose: (label: string) => void;
}

/**
 * The end-to-end build's menus, which never reach the screen, so popping
 * one up never brings the app forward. Each is added to the main process's
 * global under `meruTestContextMenus`, the last popped up last.
 */
export const createCapturedContextMenus = (): ContextMenus => {
  const captured: CapturedContextMenu[] = [];

  Reflect.set(globalThis, "meruTestContextMenus", captured);

  return {
    popup: (window, items, at) => {
      captured.push({
        windowId: window.id,
        at: at ?? null,
        items: items.map((item) =>
          "type" in item
            ? { separator: true }
            : {
                label: item.label,
                enabled: item.enabled,
                checked: item.checked ?? null,
                accelerator: item.accelerator ?? null,
              }
        ),
        choose: (label) => {
          const item = items.find(
            (candidate) => !("type" in candidate) && candidate.label === label
          );

          if (!item || "type" in item || !item.enabled) {
            throw new Error(`The menu has no enabled item ${label}`);
          }

          item.click?.();
        },
      });
    },
  };
};
