import { $ } from "select-dom";
import { ipcMain } from "./ipc";

function detectOutOfOfficeBanner() {
	const outOfOfficeElement = $("#\\:7:has(div#\\:k)");

	ipcMain.send("gmail.setOutOfOffice", Boolean(outOfOfficeElement));
}

export function initOutOfOfficeDetection() {
	detectOutOfOfficeBanner();

	const observer = new MutationObserver(() => {
		detectOutOfOfficeBanner();
	});

	observer.observe(document.body, {
		childList: true,
		subtree: true,
	});
}
