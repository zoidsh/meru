import { IpcEmitter, IpcListener } from "@electron-toolkit/typed-ipc/renderer";
import type { IpcMainEvents, IpcRendererEvent } from "@meru/shared/types";

export const ipc = {
	renderer: new IpcListener<IpcRendererEvent>(),
	main: new IpcEmitter<IpcMainEvents>(),
};

export function initIpc() {
	ipc.renderer.on("gmail.navigateTo", (_event, destination) => {
		window.location.hash = `#${destination}`;
	});

	ipc.renderer.on("gmail.openMessage", (_event, messageId: string) => {
		window.location.hash = `#inbox/${messageId}`;
	});
}
