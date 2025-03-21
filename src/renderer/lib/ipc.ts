import type { IpcMainEvents, IpcRendererEvent } from "@/ipc";
import { IpcEmitter, IpcListener } from "@electron-toolkit/typed-ipc/renderer";

export const ipcRenderer = new IpcListener<IpcRendererEvent>();

export const ipcMain = new IpcEmitter<IpcMainEvents>();
