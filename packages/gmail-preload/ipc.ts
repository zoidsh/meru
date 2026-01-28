import { IpcEmitter, IpcListener } from "@electron-toolkit/typed-ipc/renderer";
import type { IpcMainEvents, IpcRendererEvent } from "@meru/shared/types";
import { refreshInbox, sendMailAction } from "./inbox";

export const ipcRenderer = new IpcListener<IpcRendererEvent>();

export const ipcMain = new IpcEmitter<IpcMainEvents>();

ipcRenderer.on("gmail.navigateTo", (_event, destination) => {
	window.location.hash = `#${destination}`;
});

ipcRenderer.on("gmail.openMessage", (_event, messageId: string) => {
	window.location.hash = `#inbox/${messageId}`;
});

ipcRenderer.on("gmail.handleMessage", async (_event, messageId, action) => {
	await sendMailAction(messageId, action);

	refreshInbox();
});
