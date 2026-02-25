import "./electron-api";
import "./ipc";
import { $ } from "select-dom";
import { moveAttachmentsToTop } from "./attachments";
import { openComposeInNewWindow } from "./compose";
import { initCss } from "./css";
import { getUnreadCount } from "./inbox";
import { ipcMain } from "./ipc";
import { createElementNotProcessedSelector } from "./lib/utils";
import { observeOutOfOfficeBanner } from "./out-of-office";
import { addSenderIcons } from "./sender-icons";
import { initToaster } from "./toaster";
import { initUrlPreview } from "./url-preview";

const features = [
	getUnreadCount,
	observeOutOfOfficeBanner,
	addSenderIcons,
	moveAttachmentsToTop,
	openComposeInNewWindow,
	setUserEmail,
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

const userEmailElementProcessedAttribute = "data-meru-user-email";

function setUserEmail() {
	const userEmail = $(
		createElementNotProcessedSelector(
			"meta[name='og-profile-acct']",
			userEmailElementProcessedAttribute,
		),
	)?.getAttribute("content");

	if (!userEmail) {
		return;
	}

	ipcMain.send("gmail.setUserEmail", userEmail);
}

document.addEventListener("DOMContentLoaded", () => {
	if (window.location.hostname !== "mail.google.com") {
		return;
	}

	initCss();
	initUrlPreview();
	initToaster();

	const observer = new MutationObserver(() => {
		runFeatures();
	});

	observer.observe(document.body, {
		childList: true,
		subtree: true,
	});
});
