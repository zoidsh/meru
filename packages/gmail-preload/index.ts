import "./electron-api";
import { moveAttachmentsToTop } from "./attachments";
import { openComposeInNewWindow } from "./compose";
import { initCss } from "./css";
import { initInboxObserver } from "./inbox-observer";
import { initIpc } from "./ipc";
import { observeOutOfOfficeBanner } from "./out-of-office";
import { addSenderIcons } from "./sender-icons";
import { initUrlPreview } from "./url-preview";

const features = [
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
	initIpc();
	initUrlPreview();
	initInboxObserver();

	const observer = new MutationObserver(() => {
		runFeatures();
	});

	observer.observe(document.body, {
		childList: true,
		subtree: true,
	});
});
