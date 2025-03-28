import type { IpcMainEvents, IpcRendererEvent } from "@/ipc";
import { IpcEmitter, IpcListener } from "@electron-toolkit/typed-ipc/renderer";

export const ipcRenderer = new IpcListener<IpcRendererEvent>();

export const ipcMain = new IpcEmitter<IpcMainEvents>();

export function initIpc() {
	ipcRenderer.on("navigateTo", (_event, destination) => {
		window.location.hash = `#${destination}`;
	});

	ipcRenderer.on("openMail", (_event, messageId: string) => {
		window.location.hash = `#inbox/${messageId}`;
	});
}
