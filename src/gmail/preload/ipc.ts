import type { IpcMainEvents, IpcRendererEvent } from "@/ipc";
import { IpcEmitter, IpcListener } from "@electron-toolkit/typed-ipc/renderer";

export const ipcRenderer = new IpcListener<IpcRendererEvent>();

export const ipcMain = new IpcEmitter<IpcMainEvents>();

window.addEventListener("DOMContentLoaded", () => {
	ipcRenderer.on("gmail.navigateTo", (_event, destination) => {
		window.location.hash = `#${destination}`;
	});

	ipcRenderer.on("gmail.mail.open", (_event, messageId: string) => {
		window.location.hash = `#inbox/${messageId}`;
	});
});
