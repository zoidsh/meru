import { $$ } from "select-dom";
import { ipcRenderer } from "@/ipc";

function toggleMuteButton(button: "microphone" | "camera") {
	const muteButtons = $$("button[data-is-muted]");

	if (button === "microphone" && muteButtons[0]) {
		muteButtons[0].click();
	} else if (button === "camera" && muteButtons[1]) {
		muteButtons[1].click();
	}
}

export function initMeetPreload() {
	ipcRenderer.on("googleMeet.toggleMicrophone", () => {
		toggleMuteButton("microphone");
	});

	ipcRenderer.on("googleMeet.toggleCamera", () => {
		toggleMuteButton("camera");
	});
}
