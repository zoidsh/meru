import { IpcEmitter, IpcListener } from "@electron-toolkit/typed-ipc/renderer";
import type { IpcMainEvents, IpcRendererEvent } from "@meru/shared/types";
import { initAccountColorIndicator } from "./account-color-indicator";

export const ipcRenderer = new IpcListener<IpcRendererEvent>();

export const ipcMain = new IpcEmitter<IpcMainEvents>();

ipcRenderer.on("googleApp.initAccountColorIndicator", (_event, color) => {
  initAccountColorIndicator(color);
});
