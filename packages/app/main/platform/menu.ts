import { BrowserWindow, Menu } from "electron";
import type { BaseWindow, MenuItemConstructorOptions } from "electron";

export interface MenuAction {
  readonly kind: "action";
  readonly id: string;
  readonly label: string;
  readonly accelerator: string;
  readonly run: (windowId: number | undefined) => void;
}

export type MenuSection =
  | {
      readonly kind: "role";
      readonly role: "appMenu" | "fileMenu" | "editMenu";
    }
  | {
      readonly kind: "submenu";
      readonly label: string;
      readonly entries: readonly MenuAction[];
    };

// A click from the menu bar names the window it was for; one from MenuItem.click(), or with the app inactive, names none, so the focused or first window stands in.
const windowIdOf = (window: BaseWindow | undefined): number | undefined => {
  const target =
    (window instanceof BrowserWindow ? window : undefined) ??
    BrowserWindow.getFocusedWindow() ??
    BrowserWindow.getAllWindows()[0];
  return target?.webContents.id;
};

const entry = (item: MenuAction): MenuItemConstructorOptions => ({
  accelerator: item.accelerator,
  click: (_item, window) => {
    item.run(windowIdOf(window));
  },
  id: item.id,
  label: item.label,
});

export const setApplicationMenu = (sections: readonly MenuSection[]): void => {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate(
      sections.map((section) =>
        section.kind === "role"
          ? { role: section.role }
          : { label: section.label, submenu: section.entries.map(entry) }
      )
    )
  );
};
