import "./electron-api";
import "./ipc";
import { moveAttachmentsToTop } from "./attachments";
import { openComposeInNewWindow } from "./compose";
import { initCss } from "./css";
import { getUnreadCount } from "./inbox";
import { observeOutOfOfficeBanner } from "./out-of-office";
import { addSenderIcons } from "./sender-icons";
import { initUrlPreview } from "./url-preview";

const features = [
	getUnreadCount,
	observeOutOfOfficeBanner,
	addSenderIcons,
	moveAttachmentsToTop,
	openComposeInNewWindow,
];

function runFeatures() {
	for (const feature of features) {
		try {
			feature();
		} catch (error) {
			console.error("Error running feature:", error);
		}
	}
}

document.addEventListener("DOMContentLoaded", () => {
	if (window.location.hostname !== "mail.google.com") {
		return;
	}

	initCss();
	initUrlPreview();

	const observer = new MutationObserver(() => {
		runFeatures();
	});

	observer.observe(document.body, {
		childList: true,
		subtree: true,
	});
});
