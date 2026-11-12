import path from "node:path";

import { createElectronPorts } from "./platform/ports.ts";
import { MainWindow } from "./shell/window.ts";

const start = async () => {
  const ports = createElectronPorts();
  const dist = path.join(import.meta.dirname, "..");

  ports.app.onWindowAllClosed(() => {
    ports.app.quit();
  });
  await ports.app.whenReady();
  if (process.env.MERU_TEST_BACKGROUND === "1") {
    ports.app.prohibitActivation();
  }

  const window = new MainWindow({
    background: process.env.MERU_BACKGROUND === "1",
    ports,
    preload: path.join(dist, "preload", "renderer.cjs"),
    rendererFile: path.join(dist, "renderer", "chrome.html"),
    rendererUrl: process.env.MERU_RENDERER_URL,
  });
  await window.show();
};

// Not awaited: Electron holds back "ready" until an ES module entry finishes evaluating, so a top-level await on whenReady() never settles.
const main = async () => {
  try {
    await start();
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

void main();
