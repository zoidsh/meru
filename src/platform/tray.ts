import path from "node:path";

import { Menu, Tray, nativeImage } from "electron";

export type TrayMenuItem =
  | { kind: "item"; label: string; click: () => void }
  | { kind: "separator" };

export interface TrayIcon {
  /** One of the images the build packed, by file name. */
  setImage: (name: string) => void;
  /** Text beside the icon; macOS alone shows it. */
  setTitle: (title: string) => void;
  setToolTip: (text: string) => void;
  /** The menu the icon opens itself on any click, as on Linux. */
  setContextMenu: (items: readonly TrayMenuItem[]) => void;
  /** Opens a menu at the icon now. */
  popUpMenu: (items: readonly TrayMenuItem[]) => void;
  onClick: (listener: () => void) => void;
  onRightClick: (listener: () => void) => void;
  destroy: () => void;
}

export interface TrayFactory {
  create: (imageName: string) => TrayIcon;
}

const buildMenu = (items: readonly TrayMenuItem[]) =>
  Menu.buildFromTemplate(
    items.map((item) =>
      item.kind === "separator"
        ? { type: "separator" as const }
        : { label: item.label, click: item.click }
    )
  );

/**
 * Real tray icons, their images read from `imageDirectory`. A name ending in
 * `Template` is a macOS template image, and its `@2x` file is found beside it.
 */
export const createTrayFactory = (imageDirectory: string): TrayFactory => {
  const image = (name: string) =>
    nativeImage.createFromPath(path.join(imageDirectory, name));

  return {
    create: (imageName) => {
      const tray = new Tray(image(imageName));

      return {
        setImage: (name) => {
          tray.setImage(image(name));
        },
        setTitle: (title) => {
          if (process.platform === "darwin") {
            tray.setTitle(title);
          }
        },
        setToolTip: (text) => {
          tray.setToolTip(text);
        },
        setContextMenu: (items) => {
          tray.setContextMenu(buildMenu(items));
        },
        popUpMenu: (items) => {
          tray.popUpContextMenu(buildMenu(items));
        },
        onClick: (listener) => {
          tray.on("click", listener);
        },
        onRightClick: (listener) => {
          tray.on("right-click", listener);
        },
        destroy: () => {
          tray.destroy();
        },
      };
    },
  };
};

/** The end-to-end build's tray, as a test reads and clicks it. */
interface CapturedTray {
  image: string;
  title: string;
  toolTip: string;
  /** The menu last set on the icon or popped up from it. */
  menu: readonly TrayMenuItem[];
  click: () => void;
  rightClick: () => void;
  /** Clicks the item of `menu` with this label. */
  clickItem: (label: string) => void;
}

/**
 * The end-to-end build's trays, which never reach the menu bar or the
 * notification area. The one that exists is on the main process's global
 * under `meruTestTray`, and nothing is there while none does.
 */
export const createCapturedTrayFactory = (): TrayFactory => ({
  create: (imageName) => {
    const clicks = new Set<() => void>();
    const rightClicks = new Set<() => void>();
    const captured: CapturedTray = {
      image: imageName,
      title: "",
      toolTip: "",
      menu: [],
      click: () => {
        for (const listener of clicks) {
          listener();
        }
      },
      rightClick: () => {
        for (const listener of rightClicks) {
          listener();
        }
      },
      clickItem: (label) => {
        const item = captured.menu.find(
          (candidate) => candidate.kind === "item" && candidate.label === label
        );

        if (item?.kind !== "item") {
          throw new Error(`The tray's menu has no item ${label}`);
        }

        item.click();
      },
    };

    Reflect.set(globalThis, "meruTestTray", captured);

    return {
      setImage: (name) => {
        captured.image = name;
      },
      setTitle: (title) => {
        captured.title = title;
      },
      setToolTip: (text) => {
        captured.toolTip = text;
      },
      setContextMenu: (items) => {
        captured.menu = items;
      },
      popUpMenu: (items) => {
        captured.menu = items;
      },
      onClick: (listener) => {
        clicks.add(listener);
      },
      onRightClick: (listener) => {
        rightClicks.add(listener);
      },
      destroy: () => {
        if (Reflect.get(globalThis, "meruTestTray") === captured) {
          Reflect.deleteProperty(globalThis, "meruTestTray");
        }
      },
    };
  },
});
