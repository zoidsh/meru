import { app, BrowserWindow } from "electron";

import type { Ports, WindowPort, WindowSpec } from "../../core/ports.ts";

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

  return {
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
});
