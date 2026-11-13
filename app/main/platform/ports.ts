import { randomUUID } from "node:crypto";

import {
  app,
  BrowserWindow,
  nativeTheme,
  net,
  powerMonitor,
  screen,
  session,
  shell,
} from "electron";

import type {
  EntitlementApi,
  Ports,
  WindowPort,
  WindowSpec,
} from "../../core/ports.ts";
import { createEntitlementApi } from "./entitlement-api.ts";
import { createFs } from "./fs.ts";
import { ipcTransport } from "./ipc.ts";
import { onBeforeInput } from "./keys.ts";
import { onlinePort } from "./online.ts";
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
    setIgnoreMenuShortcuts: (ignore) => {
      window.webContents.setIgnoreMenuShortcuts(ignore);
    },
  };
};

const quitTasks = new Set<() => Promise<void>>();
let quitHeld = false;

// before-quit is the last moment the main process can still write; holding the quit there and quitting again once the tasks settle is how Electron lets a quit wait on async work.
const holdQuit = (event: { preventDefault: () => void }) => {
  if (quitHeld || quitTasks.size === 0) {
    return;
  }
  event.preventDefault();
  quitHeld = true;
  const settle = async () => {
    await Promise.allSettled(
      [...quitTasks].map(async (task) => {
        await task();
      })
    );
    app.quit();
  };
  void settle();
};

export const createElectronPorts = (): Ports => ({
  lifecycle: {
    onQuit: (task) => {
      if (quitTasks.size === 0) {
        app.on("before-quit", holdQuit);
      }
      quitTasks.add(task);
      return () => {
        quitTasks.delete(task);
      };
    },
    onWindowAllClosed: (listener) => {
      app.on("window-all-closed", listener);
      return () => {
        app.off("window-all-closed", listener);
      };
    },
    packaged: app.isPackaged,
    platform: process.platform,
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
  sessions: {
    clear: async (partition) => {
      const found = session.fromPartition(partition);
      await found.clearStorageData();
      await found.clearCache();
    },
  },
  shell: {
    openExternal: (url) => {
      const open = async () => {
        try {
          await shell.openExternal(url);
        } catch (error) {
          console.error(error);
        }
      };
      void open();
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
