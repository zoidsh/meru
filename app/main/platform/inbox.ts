import {
  app,
  BrowserWindow,
  Menu,
  nativeImage,
  Notification,
  Tray,
} from "electron";
import type { NativeImage } from "electron";

import {
  badgeText,
  OVERLAY_SIZE,
  overlayPixels,
} from "../../core/engines/badge.ts";
import type {
  BadgePort,
  NotificationPort,
  TrayIcon,
  TrayPort,
} from "../../core/ports.ts";
import menuBar from "./icons/IconMenuBarTemplate.png?inline";
import menuBar2x from "./icons/IconMenuBarTemplate@2x.png?inline";
import trayDark from "./icons/IconTray-Dark.png?inline";
import trayLight from "./icons/IconTray-Light.png?inline";
import trayUnreadDark from "./icons/IconTrayUnread-Dark.png?inline";
import trayUnreadLight from "./icons/IconTrayUnread-Light.png?inline";

// Windows draws an overlay over the taskbar button rather than taking a count, and wants it in BGRA.
const overlayImage = (total: number): NativeImage => {
  const rgba = overlayPixels(total);
  const bgra = Buffer.from(rgba);
  for (let offset = 0; offset < bgra.length; offset += 4) {
    bgra[offset] = rgba[offset + 2] ?? 0;
    bgra[offset + 2] = rgba[offset] ?? 0;
  }
  return nativeImage.createFromBitmap(bgra, {
    height: OVERLAY_SIZE,
    width: OVERLAY_SIZE,
  });
};

export const createBadge = (platform: string): BadgePort => ({
  set: (total) => {
    if (platform === "darwin") {
      app.dock?.setBadge(badgeText(total));
    } else if (platform === "win32") {
      for (const window of BrowserWindow.getAllWindows()) {
        window.setOverlayIcon(
          total > 0 ? overlayImage(total) : null,
          total > 0 ? "You have unread messages" : ""
        );
      }
    } else {
      app.setBadgeCount(total);
    }
  },
});

export const notificationPort: NotificationPort = {
  show: (spec, onClick) => {
    if (!Notification.isSupported()) {
      return;
    }
    const notification = new Notification(spec);
    notification.on("click", onClick);
    notification.show();
  },
};

const iconImage = (icon: TrayIcon): NativeImage => {
  if (icon.kind === "template") {
    const image = nativeImage.createFromDataURL(menuBar);
    image.addRepresentation({ dataURL: menuBar2x, scaleFactor: 2 });
    image.setTemplateImage(true);
    return image;
  }
  const urls = {
    dark: icon.unread ? trayUnreadDark : trayDark,
    light: icon.unread ? trayUnreadLight : trayLight,
  };
  return nativeImage.createFromDataURL(urls[icon.shade]);
};

export const createTray = (): TrayPort => {
  let tray: Tray | undefined;
  let click: (() => void) | undefined;
  return {
    hide: () => {
      tray?.destroy();
      tray = undefined;
    },
    show: (spec, onClick) => {
      click = onClick;
      if (tray === undefined) {
        tray = new Tray(iconImage(spec.icon));
        tray.setToolTip(app.name);
        tray.on("click", () => {
          click?.();
        });
      } else {
        tray.setImage(iconImage(spec.icon));
      }
      tray.setTitle(spec.title);
      const menu = Menu.buildFromTemplate(
        spec.menu.map((item) => {
          if (item.kind === "separator") {
            return { type: "separator" };
          }
          if (item.kind === "quit") {
            return { label: item.label, role: "quit" };
          }
          return { click: item.run, label: item.label };
        })
      );
      const shown = tray;
      // Linux shows a tray's menu on any click and never sends the click itself, so there it is the context menu; elsewhere a right click opens it.
      if (process.platform === "linux") {
        shown.setContextMenu(menu);
      } else {
        shown.removeAllListeners("right-click");
        shown.on("right-click", () => {
          shown.popUpContextMenu(menu);
        });
      }
    },
  };
};
