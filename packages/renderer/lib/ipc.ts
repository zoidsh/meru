import { IpcEmitter, IpcListener } from "@electron-toolkit/typed-ipc/renderer";
import type { IpcMainEvents, IpcRendererEvent } from "@meru/shared/ipc";

export const ipcRenderer = new IpcListener<IpcRendererEvent>();

export const ipcMain = new IpcEmitter<IpcMainEvents>();
