import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { config } from "@/config";
import { createNotification } from "@/notifications";
import type { DownloadItem } from "@meru/shared/types";
import { shell } from "electron";
import electronDl from "electron-dl";
import { ipc } from "./ipc";
import { main } from "./main";

class Downloads {
	addDownloadHistoryItem({
		fileName,
		filePath,
		createdAt,
		exists,
	}: Omit<DownloadItem, "id">) {
		const item = {
			id: randomUUID(),
			fileName,
			filePath,
			createdAt,
			exists,
		};

		config.set("downloads.history", [item, ...config.get("downloads.history")]);

		return item;
	}

	init() {
		const openFolderWhenDone = config.get("downloads.openFolderWhenDone");

		const handleStarted = (item: Electron.DownloadItem) => {
			item.once("done", (_, state) => {
				const filePath = item.getSavePath();
				const fileName = path.basename(filePath);

				const { id } = this.addDownloadHistoryItem({
					fileName,
					filePath,
					createdAt: item.getStartTime(),
					exists: true,
				});

				ipc.renderer.send(
					main.window.webContents,
					"downloads.itemCompleted",
					id,
				);

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

		ipc.main.handle("downloads.getHistory", () =>
			config.get("downloads.history"),
		);

		ipc.main.handle("downloads.openFile", async (_event, filePath) => {
			const error = await shell.openPath(filePath);

			return {
				error: error
					? fs.existsSync(filePath)
						? error
						: "File does not exist"
					: null,
			};
		});

		ipc.main.handle("downloads.showFileInFolder", (_event, filePath) => {
			if (!fs.existsSync(filePath)) {
				return {
					error: "File does not exist",
				};
			}

			shell.showItemInFolder(filePath);

			return { error: null };
		});

		ipc.main.on("downloads.removeHistoryItem", (_event, itemId) => {
			config.set(
				"downloads.history",
				config.get("downloads.history").filter((item) => item.id !== itemId),
			);
		});

		ipc.main.on("downloads.clearHistory", () => {
			config.set("downloads.history", []);
		});

		config.onDidChange("downloads.history", (downloadHistory) => {
			if (downloadHistory) {
				ipc.renderer.send(
					main.window.webContents,
					"downloads.historyChanged",
					downloadHistory,
				);
			}
		});
	}
}

export const downloads = new Downloads();
