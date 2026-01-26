import { $ } from "select-dom";
import { ipcMain } from "./ipc";

export function observeOutOfOfficeBanner() {
	const outOfOfficeElement = $("#\\:7:has(div#\\:k)");

	ipcMain.send("gmail.setOutOfOffice", Boolean(outOfOfficeElement));
}
