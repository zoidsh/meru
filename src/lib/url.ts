import { shell } from "electron";

export function openExternalUrl(url: string) {
	shell.openExternal(url);
}
