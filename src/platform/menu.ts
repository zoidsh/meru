import { Menu } from "electron";
import type { MenuItemConstructorOptions } from "electron";

/** Replaces Electron's default application menu, on every platform. */
export const setApplicationMenu = (template: MenuItemConstructorOptions[]) => {
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
};
