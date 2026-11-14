import { app, BrowserWindow, Menu } from "electron";
import type {
  BaseWindow,
  MenuItem,
  MenuItemConstructorOptions,
} from "electron";

import type { MenuEntry, MenuSection } from "../../core/records/menu.ts";
import { commandIdSchema } from "../../shared/commands/registry.ts";
import type { CommandId } from "../../shared/commands/registry.ts";

// A click from the menu bar names the window it was for; one from MenuItem.click(), or with the app inactive, names none, so the focused or first window stands in.
const windowIdOf = (window: BaseWindow | undefined): number | undefined => {
  const target =
    (window instanceof BrowserWindow ? window : undefined) ??
    BrowserWindow.getFocusedWindow() ??
    BrowserWindow.getAllWindows()[0];
  return target?.webContents.id;
};

const entry = (item: MenuEntry<CommandId>): MenuItemConstructorOptions => {
  if (item.kind === "separator") {
    return { type: "separator" };
  }
  if (item.kind === "role") {
    return { role: item.role };
  }
  return {
    accelerator: item.accelerator,
    click: (_item, window) => {
      item.run(windowIdOf(window));
    },
    enabled: item.enabled,
    id: item.id,
    label: item.label,
    ...(item.checked === undefined
      ? {}
      : { checked: item.checked, type: "checkbox" }),
  };
};

export const setApplicationMenu = (
  sections: readonly MenuSection<CommandId>[]
): void => {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate(
      sections.map((section): MenuItemConstructorOptions => {
        if (section.kind === "role") {
          return { role: section.role };
        }
        if (section.kind === "app") {
          return { label: app.name, submenu: section.entries.map(entry) };
        }
        return { label: section.label, submenu: section.entries.map(entry) };
      })
    )
  );
};

/** The accelerator of every item with an id in the application menu, as Electron holds it; null for an item with none. */
export const applicationAccelerators = (): Partial<
  Record<CommandId, string | null>
> => {
  const found: Partial<Record<CommandId, string | null>> = {};
  const visit = (items: readonly MenuItem[]) => {
    for (const item of items) {
      // Electron leaves id undefined on an item made from a role, whatever its typings say.
      const id = commandIdSchema.safeParse(item.id);
      if (id.success) {
        found[id.data] = item.accelerator ?? null;
      }
      visit(item.submenu?.items ?? []);
    }
  };
  visit(Menu.getApplicationMenu()?.items ?? []);
  return found;
};
