import { ipc } from "@/ipc";
import { main } from "@/main";

class AppState {
  isQuittingApp = false;

  isSettingsOpen = false;

  setIsSettingsOpen(value: boolean) {
    this.isSettingsOpen = value;

    ipc.renderer.send(main.window.webContents, "settings.setIsOpen", this.isSettingsOpen);
  }

  toggleIsSettingsOpen() {
    this.isSettingsOpen = !this.isSettingsOpen;

    this.setIsSettingsOpen(this.isSettingsOpen);
  }
}

export const appState = new AppState();
