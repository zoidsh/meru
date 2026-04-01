import { ipc } from "@/ipc";
import { main } from "@/main";
import { accounts } from "./accounts";

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
  }

  toggleIsSettingsOpen() {
    this.isSettingsOpen = !this.isSettingsOpen;

    ipc.renderer.send(main.window.webContents, "settings.setIsOpen", this.isSettingsOpen);

    if (this.isSettingsOpen) {
      accounts.hide();
    } else {
      accounts.show();
    }
  }
}

export const appState = new AppState();
