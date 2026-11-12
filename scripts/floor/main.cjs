// The floor Meru's measurements are read against: the least an Electron app with one sandboxed window does. `--floor-view` adds one view, the cost of a pane.
const { app, BrowserWindow, Menu, WebContentsView } = require("electron");

const webPreferences = { contextIsolation: true, sandbox: true };

Menu.setApplicationMenu(null);

const start = async () => {
  // As Meru does under the same variable, so the two are measured alike.
  if (
    process.env.MERU_TEST_BACKGROUND === "1" &&
    process.platform === "darwin"
  ) {
    app.setActivationPolicy("prohibited");
  }
  const window = new BrowserWindow({
    height: 800,
    show: false,
    webPreferences,
    width: 1200,
  });
  const roles = { [window.webContents.id]: "chrome page (window)" };
  await window.loadURL("about:blank");
  if (process.argv.includes("--floor-view")) {
    const view = new WebContentsView({ webPreferences });
    window.contentView.addChildView(view);
    view.setBounds({ height: 800, width: 1200, x: 0, y: 0 });
    roles[view.webContents.id] = "pane (view)";
    await view.webContents.loadURL("about:blank");
  }
  // Read by the measurement through Playwright, which evaluates in this process.
  globalThis.floorRoles = roles;
  window.showInactive();
};

const main = async () => {
  try {
    await app.whenReady();
    await start();
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
};

void main();
