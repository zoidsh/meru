import { platform } from "@electron-toolkit/utils";
import type { WebContents } from "electron";
import { ipc } from "@/ipc";
import { type AppMenuKeyState, readAppMenuKey } from "@/lib/app-menu-key";
import { main } from "@/main";

/**
 * macOS has the system menu bar, so this is only the way in on Windows and
 * Linux, where the menu lives behind a button in the titlebar.
 *
 * Every view in the window listens, because each one is a webContents of its
 * own and the keys only reach whichever has focus. The renderer is asked to do
 * the opening rather than main: it knows where the button is drawn, so the menu
 * comes up against the button either way.
 */
export function watchForAppMenuKey(webContents: WebContents) {
  if (platform.isMacOS) {
    return;
  }

  let state: AppMenuKeyState = "idle";

  webContents.on("before-input-event", (event, input) => {
    const result = readAppMenuKey(state, input);

    state = result.state;

    if (!result.opensMenu) {
      return;
    }

    // The page never sees the key that opened the menu.
    event.preventDefault();

    ipc.renderer.send(main.window.webContents, "appMenu.toggle");
  });

  // A press of the mouse ends the gesture, the way it does in Chromium's own
  // menu bar: Alt held for a drag or a modified click is not a reach for the
  // menu. This is `input-event` rather than `before-input-event`, which is
  // keys only.
  webContents.on("input-event", (_event, input) => {
    state = readAppMenuKey(state, input).state;
  });

  // Alt+Tab takes the window away mid-gesture and the release never arrives.
  webContents.on("blur", () => {
    state = "idle";
  });
}
