import { IpcEmitter, IpcListener } from "@electron-toolkit/typed-ipc/renderer";
import type { IpcMainEvents, IpcRendererEvent } from "@meru/shared/types";
import { $$ } from "select-dom";

export const ipcRenderer = new IpcListener<IpcRendererEvent>();

export const ipcMain = new IpcEmitter<IpcMainEvents>();

function toggleMuteButton(button: "microphone" | "camera") {
	const muteButtons = $$("button[data-is-muted]");

	if (button === "microphone" && muteButtons[0]) {
		muteButtons[0].click();
	} else if (button === "camera" && muteButtons[1]) {
		muteButtons[1].click();
	}
}

export function initIpc() {
	ipcRenderer.on("googleMeet.toggleMicrophone", () => {
		toggleMuteButton("microphone");
	});

	ipcRenderer.on("googleMeet.toggleCamera", () => {
		toggleMuteButton("camera");
	});
}
