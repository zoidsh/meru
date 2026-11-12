import { BrowserWindow, Menu } from "electron";
import type {
  BaseWindow,
  MenuItem,
  MenuItemConstructorOptions,
} from "electron";

export interface MenuAction {
  readonly kind: "action";
  readonly id: string;
  readonly label: string;
  readonly accelerator: string | undefined;
  readonly run: (windowId: number | undefined) => void;
}

export type MenuEntry =
  | MenuAction
  | { readonly kind: "separator" }
  | {
      readonly kind: "role";
      readonly role:
        | "undo"
        | "redo"
        | "cut"
        | "copy"
        | "paste"
        | "pasteAndMatchStyle"
        | "delete"
        | "selectAll";
    };

export type MenuSection =
  | {
      readonly kind: "role";
      readonly role: "appMenu" | "fileMenu" | "editMenu";
    }
  | {
      readonly kind: "submenu";
      readonly label: string;
      readonly entries: readonly MenuEntry[];
    };

// A click from the menu bar names the window it was for; one from MenuItem.click(), or with the app inactive, names none, so the focused or first window stands in.
const windowIdOf = (window: BaseWindow | undefined): number | undefined => {
  const target =
    (window instanceof BrowserWindow ? window : undefined) ??
    BrowserWindow.getFocusedWindow() ??
    BrowserWindow.getAllWindows()[0];
  return target?.webContents.id;
};

const entry = (item: MenuEntry): MenuItemConstructorOptions => {
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
    id: item.id,
    label: item.label,
  };
};

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

/** The accelerator of every item with an id in the application menu, as Electron holds it; null for an item with none. */
export const applicationAccelerators = (): Record<string, string | null> => {
  const found: Record<string, string | null> = {};
  const visit = (items: readonly MenuItem[]) => {
    for (const item of items) {
      if (item.id !== "") {
        found[item.id] = item.accelerator ?? null;
      }
      visit(item.submenu?.items ?? []);
    }
  };
  visit(Menu.getApplicationMenu()?.items ?? []);
  return found;
};
