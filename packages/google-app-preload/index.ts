import "./electron-api";
import { initMeetPreload } from "./apps/meet";
import { ipcRenderer } from "./ipc";

const appPreloadScripts: Record<string, () => void> = {
	"meet.google.com": initMeetPreload,
};

function showAccountColorIndicator(value: string) {
	const elementId = "meru-account-color";

	if (document.getElementById(elementId)) {
		return;
	}

	const accountColorElement = document.createElement("div");

	accountColorElement.id = elementId;

	accountColorElement.style.position = "fixed";
	accountColorElement.style.top = "0";
	accountColorElement.style.left = "0";
	accountColorElement.style.right = "0";
	accountColorElement.style.height = "4px";
	accountColorElement.style.backgroundColor = value;
	accountColorElement.style.zIndex = "999999";

	document.body.appendChild(accountColorElement);
}

ipcRenderer.on("googleApp.showAccountColor", (_event, value) => {
	showAccountColorIndicator(value);
});

const appPreloadScript = appPreloadScripts[window.location.hostname];

if (appPreloadScript) {
	appPreloadScript();
}
