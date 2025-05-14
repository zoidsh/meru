import { config } from "@/config";
import { createNotification } from "@/notifications";
import { shell } from "electron";
import electronDl from "electron-dl";

export function initDownloads(): void {
	const openFolderWhenDone = config.get("downloads.openFolderWhenDone");

	const handleStarted = (item: Electron.DownloadItem) => {
		item.once("done", (_, state) => {
			const fileName = item.getFilename();
			const filePath = item.getSavePath();

			createNotification(`Download ${state}`, fileName, () => {
				shell.openPath(filePath);
			});
		});
	};

	electronDl({
		saveAs: config.get("downloads.saveAs"),
		openFolderWhenDone,
		directory: config.get("downloads.location"),
		showBadge: false,
		onStarted: openFolderWhenDone ? undefined : handleStarted,
	});
}
