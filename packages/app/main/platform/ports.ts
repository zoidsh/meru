import { randomUUID } from "node:crypto";

import { app, BrowserWindow, screen } from "electron";

import type { Ports, WindowPort, WindowSpec } from "../../core/ports.ts";
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
    onResized: (listener) => {
      window.on("resize", listener);
      return () => {
        window.off("resize", listener);
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

export const createElectronPorts = (): Ports => ({
  app: {
    onWindowAllClosed: (listener) => {
      app.on("window-all-closed", listener);
      return () => {
        app.off("window-all-closed", listener);
      };
    },
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
  clock: { now: () => Date.now() },
  createWindow,
  cursor: { screenPoint: () => screen.getCursorScreenPoint() },
  ids: () => randomUUID(),
  views: viewFactory,
});
