import type { IpcMainEvents, IpcRendererEvent } from "@/main/ipc";
import { IpcEmitter, IpcListener } from "@electron-toolkit/typed-ipc/renderer";

export const ipc = new IpcListener<IpcRendererEvent>();

export const emitter = new IpcEmitter<IpcMainEvents>();
