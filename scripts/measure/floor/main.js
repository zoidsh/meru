// The floor: what any Electron app showing Gmail costs, with nothing of Meru's.
import { app, BaseWindow, WebContentsView } from "electron";

const partition =
  app.commandLine.getSwitchValue("partition") || "persist:floor";

const open = () => {
  const window = new BaseWindow({ width: 1280, height: 800, show: false });
  const view = new WebContentsView({ webPreferences: { partition } });

  const fit = () => {
    const { width, height } = window.getContentBounds();

    view.setBounds({ x: 0, y: 0, width, height });
  };

  window.contentView.addChildView(view);
  fit();
  window.on("resize", fit);
  window.showInactive();
  void view.webContents.loadURL("https://mail.google.com/mail/u/0/");
};

app.on("window-all-closed", () => {
  app.quit();
});

// Not a top-level await: Electron holds `ready` until an ES module entry has
// finished evaluating, so awaiting it there never resolves.
void app.whenReady().then(open);
