import type { IpcMainEvents, IpcRendererEvent } from "@/gmail";
import { IpcEmitter, IpcListener } from "@electron-toolkit/typed-ipc/renderer";

const ipc = new IpcListener<IpcRendererEvent>();

const emitter = new IpcEmitter<IpcMainEvents>();

ipc.on("navigateTo", (_event, destination) => {
	window.location.hash = `#${destination}`;
});
