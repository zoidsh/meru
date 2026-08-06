import { ipc } from "@/ipc";
import { main } from "@/main";
import { accounts } from "./accounts";
import { appMenu } from "./menu";

class AppState {
  isQuittingApp = false;

  isSettingsOpen = false;

  setIsSettingsOpen(value: boolean) {
    this.isSettingsOpen = value;

    ipc.renderer.send(main.window.webContents, "settings.setIsOpen", this.isSettingsOpen);

    if (this.isSettingsOpen) {
      accounts.hide();
    } else {
      accounts.show();
    }

    appMenu.refresh();
  }

  toggleIsSettingsOpen() {
    this.setIsSettingsOpen(!this.isSettingsOpen);
  }
}

export const appState = new AppState();
