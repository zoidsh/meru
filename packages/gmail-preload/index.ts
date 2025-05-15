import "./electron-api";
import { initInboxObserver } from "./inbox-observer";
import { initIpc } from "./ipc";
import { initUrlPreview } from "./url-preview";

document.addEventListener("DOMContentLoaded", () => {
	if (window.location.hostname !== "mail.google.com") {
		return;
	}

	const searchParams = new URLSearchParams(window.location.search);

	document.documentElement.classList.add("meru");

	if (searchParams.get("hideGmailLogo") === "true") {
		document.documentElement.classList.add("hide-gmail-logo");
	}

	if (searchParams.get("hideInboxFooter") === "true") {
		document.documentElement.classList.add("hide-inbox-footer");
	}

	if (searchParams.get("reverseConversation") === "true") {
		document.documentElement.classList.add("reverse-conversation");
	}

	initIpc();
	initUrlPreview();
	initInboxObserver();
});
