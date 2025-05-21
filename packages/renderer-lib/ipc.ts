import { IpcEmitter, IpcListener } from "@electron-toolkit/typed-ipc/renderer";
import type { IpcMainEvents, IpcRendererEvent } from "@meru/shared/types";

export const ipc = {
	main: new IpcEmitter<IpcMainEvents>(),
	renderer: new IpcListener<IpcRendererEvent>(),
};
