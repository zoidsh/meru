import "./electron-api";
import { initIpc } from "./ipc";

document.addEventListener("DOMContentLoaded", () => {
	if (window.location.hostname !== "meet.google.com") {
		return;
	}

	initIpc();
});
