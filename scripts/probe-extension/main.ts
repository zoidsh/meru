/**
 * The probe's Electron main process: stock Electron and nothing of Meru's. It
 * loads the probe extension into the default session, opens its page, and
 * takes the rest of its orders from the driver one line at a time on stdin.
 */
import { app, BrowserWindow, session } from "electron";
import { PAGE_PATH } from "./protocol";

const { PROBE_ORIGIN, PROBE_EXTENSION_DIR } = process.env;

if (!PROBE_ORIGIN || !PROBE_EXTENSION_DIR) {
  throw new Error("Run this through scripts/probe-extension-api.ts");
}

const post = (route: string, body: unknown) =>
  fetch(`${PROBE_ORIGIN}${route}`, { method: "POST", body: JSON.stringify(body) });

// Nothing here is for anyone to look at, and a window that came forward would
// take the foreground from whatever else runs on the machine
if (process.platform === "darwin") {
  app.setActivationPolicy("prohibited");
}

app.on("window-all-closed", () => {});

const openHidden = (url: string) => {
  const window = new BrowserWindow({ show: false });

  window.loadURL(url).catch((error: unknown) => post("/log", { url, error: String(error) }));
};

process.stdin.setEncoding("utf8");

process.stdin.on("data", (data: string) => {
  for (const command of data.split("\n")) {
    if (command === "open-web") {
      openHidden(`${PROBE_ORIGIN}${PAGE_PATH}`);
    } else if (command === "quit") {
      app.quit();
    }
  }
});

// CommonJS without a top-level await: built as an ES module awaiting
// `whenReady` at top level, the main process never got a page to load
void app.whenReady().then(async () => {
  void post("/versions", {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
  });

  const extension = await session.defaultSession.extensions.loadExtension(PROBE_EXTENSION_DIR);

  openHidden(`chrome-extension://${extension.id}/page.html`);
});
