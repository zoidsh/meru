import { IpcEmitter, IpcListener } from "@electron-toolkit/typed-ipc/renderer";
import type { IpcMainEvents, IpcRendererEvent } from "@meru/shared/types";

export const ipcRenderer = new IpcListener<IpcRendererEvent>();

export const ipcMain = new IpcEmitter<IpcMainEvents>();

export function initIpc() {
	ipcRenderer.on("gmail.navigateTo", (_event, destination) => {
		window.location.hash = `#${destination}`;
	});

	ipcRenderer.on("gmail.openMessage", (_event, messageId: string) => {
		window.location.hash = `#inbox/${messageId}`;
	});
}
