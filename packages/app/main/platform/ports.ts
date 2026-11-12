import { randomUUID } from "node:crypto";

import { app, BrowserWindow, net, powerMonitor, screen } from "electron";

import type {
  EntitlementApi,
  Ports,
  WindowPort,
  WindowSpec,
} from "../../core/ports.ts";
import { createEntitlementApi } from "./entitlement-api.ts";
import { createFs } from "./fs.ts";
import { ipcTransport } from "./ipc.ts";
import { onlinePort } from "./online.ts";
import { handleOf, portOf, viewFactory } from "./views.ts";

const createWindow = (spec: WindowSpec): WindowPort => {
  const window = new BrowserWindow({
    height: spec.height,
    show: false,
    title: spec.title,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: spec.preload,
      sandbox: true,
    },
    width: spec.width,
  });
  const content = window.contentView;

  return {
    addChildView: (view, index) => {
      content.addChildView(handleOf(view), index);
    },
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
    loadFile: async (path) => {
      await window.loadFile(path);
    },
    loadUrl: async (url) => {
      await window.loadURL(url);
    },
    onClosed: (listener) => {
      window.on("closed", listener);
      return () => {
        window.off("closed", listener);
      };
    },
    // On Linux the menu bar takes its height from the content area when the window is shown, with no resize event; the classic end-to-end test catches it.
    onResized: (listener) => {
      window.on("resize", listener);
      window.on("show", listener);
      return () => {
        window.off("resize", listener);
        window.off("show", listener);
      };
    },
    removeChildView: (view) => {
      content.removeChildView(handleOf(view));
    },
    show: () => {
      window.show();
    },
    showInactive: () => {
      window.showInactive();
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
  app: {
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
  createWindow,
  cursor: { screenPoint: () => screen.getCursorScreenPoint() },
  fs: createFs(app.getPath("userData")),
  ids: () => randomUUID(),
  ipc: ipcTransport,
  network: onlinePort,
  power: {
    onResume: (listener) => {
      powerMonitor.on("resume", listener);
      return () => {
        powerMonitor.off("resume", listener);
      };
    },
  },
  views: viewFactory,
});

/** Asks the entitlement API at `url` through Chromium's network stack, which takes the system's proxy and certificates. */
export const createElectronEntitlementApi = (url: string): EntitlementApi =>
  createEntitlementApi({
    fetch: async (input, init) => await net.fetch(input, init),
    url,
  });
