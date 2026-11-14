import { randomUUID } from "node:crypto";

import {
  app,
  BrowserWindow,
  nativeTheme,
  net,
  powerMonitor,
  screen,
  shell,
} from "electron";

import type {
  EntitlementApi,
  LifecyclePort,
  Ports,
  WindowPort,
  WindowSpec,
} from "../../core/ports.ts";
import { platformOf } from "../../core/records/platform.ts";
import { createBadge, createNotifications, createTray } from "./desktop.ts";
import { createEntitlementApi } from "./entitlement-api.ts";
import { onFailure } from "./failures.ts";
import { createFs } from "./fs.ts";
import { ipcTransport } from "./ipc.ts";
import { onBeforeInput } from "./keys.ts";
import { onlinePort } from "./online.ts";
import { createSessions } from "./session.ts";
import { handleOf, portOf, viewFactory } from "./views.ts";

const createWindow = (spec: WindowSpec): WindowPort => {
  const { titleBar } = spec;
  const window = new BrowserWindow({
    ...spec.bounds,
    backgroundColor: spec.background,
    show: false,
    title: spec.title,
    titleBarOverlay: titleBar.overlay ?? false,
    titleBarStyle: titleBar.style,
    trafficLightPosition: titleBar.trafficLights ?? undefined,
    webPreferences: {
      additionalArguments: [...spec.arguments],
      contextIsolation: true,
      nodeIntegration: false,
      preload: spec.preload,
      sandbox: true,
    },
  });
  const content = window.contentView;

  return {
    addChildView: (view, index) => {
      content.addChildView(handleOf(view), index);
    },
    bounds: () => window.getBounds(),
    childViews: () =>
      content.children.flatMap((child) => {
        const port = portOf(child);
        return port === undefined ? [] : [port];
      }),
    contentBounds: () => {
      const [width = 0, height = 0] = window.getContentSize();
      return { height, width, x: 0, y: 0 };
    },
    contentsId: window.webContents.id,
    loadUrl: async (url) => {
      await window.loadURL(url);
    },
    // "close" comes last, while the bounds can still be read, so a move that sent no event of its own, as a programmatic one may not on every platform, is still kept.
    onBoundsChanged: (listener) => {
      window.on("move", listener);
      window.on("resize", listener);
      window.on("close", listener);
      return () => {
        window.off("move", listener);
        window.off("resize", listener);
        window.off("close", listener);
      };
    },
    onKey: (listener) => onBeforeInput(window.webContents, listener),
    onClosed: (listener) => {
      window.on("closed", listener);
      return () => {
        window.off("closed", listener);
      };
    },
    // On Linux the menu bar takes its height from the content area some time after the window is shown, with no resize event on the window, only on its content view; the classic end-to-end test catches it.
    onResized: (listener) => {
      window.on("resize", listener);
      content.on("bounds-changed", listener);
      return () => {
        window.off("resize", listener);
        content.off("bounds-changed", listener);
      };
    },
    removeChildView: (view) => {
      content.removeChildView(handleOf(view));
    },
    setBackgroundColor: (color) => {
      window.setBackgroundColor(color);
    },
    setTitleBarOverlay: (overlay) => {
      window.setTitleBarOverlay(overlay);
    },
    show: () => {
      window.show();
    },
    showInactive: () => {
      window.showInactive();
    },
    hide: () => {
      window.hide();
    },
    isVisible: () => window.isVisible(),
    onVisibilityChanged: (listener) => {
      window.on("show", listener);
      window.on("hide", listener);
      return () => {
        window.off("show", listener);
        window.off("hide", listener);
      };
    },
    setIgnoreMenuShortcuts: (ignore) => {
      window.webContents.setIgnoreMenuShortcuts(ignore);
    },
  };
};

// before-quit is the last moment the main process can still write; holding the quit there and quitting again once the tasks settle is how Electron lets a quit wait on async work.
const createQuitHold = (): LifecyclePort["onQuit"] => {
  const tasks = new Set<() => Promise<void>>();
  let held = false;
  const settle = async () => {
    await Promise.allSettled(
      [...tasks].map(async (task) => {
        await task();
      })
    );
    app.quit();
  };
  const hold = (event: { preventDefault: () => void }) => {
    if (held) {
      return;
    }
    event.preventDefault();
    held = true;
    void settle();
  };
  return (task) => {
    if (tasks.size === 0) {
      app.on("before-quit", hold);
    }
    tasks.add(task);
    return () => {
      tasks.delete(task);
      if (tasks.size === 0) {
        app.off("before-quit", hold);
      }
    };
  };
};

export const createElectronPorts = (): Ports => ({
  lifecycle: {
    onFailure,
    onQuit: createQuitHold(),
    onWindowAllClosed: (listener) => {
      app.on("window-all-closed", listener);
      return () => {
        app.off("window-all-closed", listener);
      };
    },
    packaged: app.isPackaged,
    platform: platformOf(process.platform),
    prohibitActivation: () => {
      if (process.platform === "darwin") {
        app.setActivationPolicy("prohibited");
      }
    },
    quit: () => {
      app.quit();
    },
    whenReady: async () => {
      await app.whenReady();
    },
  },
  clock: {
    now: () => Date.now(),
    schedule: (delay, task) => {
      const timer = setTimeout(task, delay);
      return () => {
        clearTimeout(timer);
      };
    },
  },
  displays: {
    displays: () => {
      const primary = screen.getPrimaryDisplay().id;
      return screen.getAllDisplays().map((display) => ({
        primary: display.id === primary,
        workArea: display.workArea,
      }));
    },
  },
  fs: createFs(app.getPath("userData")),
  ids: () => randomUUID(),
  ipc: ipcTransport,
  online: onlinePort,
  power: {
    onResume: (listener) => {
      powerMonitor.on("resume", listener);
      return () => {
        powerMonitor.off("resume", listener);
      };
    },
  },
  badge: createBadge(platformOf(process.platform)),
  notifications: createNotifications(),
  tray: createTray(),
  sessions: createSessions(),
  shell: {
    openExternal: async (url) => {
      await shell.openExternal(url);
    },
    // Electron answers a failure with its message rather than rejecting.
    openPath: async (path) => {
      const failed = await shell.openPath(path);
      if (failed !== "") {
        throw new Error(failed);
      }
    },
    showItemInFolder: (path) => {
      shell.showItemInFolder(path);
    },
  },
  theme: {
    dark: () => nativeTheme.shouldUseDarkColors,
    onChange: (listener) => {
      nativeTheme.on("updated", listener);
      return () => {
        nativeTheme.off("updated", listener);
      };
    },
  },
  views: viewFactory,
  windows: { create: createWindow },
});

/** Asks the entitlement API at `url` through Chromium's network stack, which takes the system's proxy and certificates. */
export const createElectronEntitlementApi = (url: string): EntitlementApi =>
  createEntitlementApi({
    fetch: async (input, init) => await net.fetch(input, init),
    url,
  });
