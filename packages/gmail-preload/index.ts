import elementReady from "element-ready";
import "./electron-api";
import { GMAIL_URL } from "@meru/shared/gmail";
import { initInboxObserver } from "./inbox-observer";
import { initIpc } from "./ipc";
import { initUrlPreview } from "./url-preview";

document.addEventListener("DOMContentLoaded", async () => {
	if (window.location.hostname !== "mail.google.com") {
		return;
	}

	const searchParams = new URLSearchParams(window.location.search);

	document.documentElement.classList.add("meru");

	if (searchParams.get("hideGmailLogo") === "true") {
		document.documentElement.classList.add("hide-gmail-logo");

		searchParams.delete("hideGmailLogo");
	}

	if (searchParams.get("hideInboxFooter") === "true") {
		document.documentElement.classList.add("hide-inbox-footer");

		searchParams.delete("hideInboxFooter");
	}

	if (searchParams.get("reverseConversation") === "true") {
		document.documentElement.classList.add("reverse-conversation");

		searchParams.delete("reverseConversation");
	}

	initIpc();
	initUrlPreview();
	initInboxObserver();

	if (searchParams.get("openComposeInNewWindow") === "true") {
		const composeButtonElement = await elementReady('div[gh="cm"]', {
			stopOnDomReady: false,
		});

		if (composeButtonElement) {
			composeButtonElement.addEventListener("click", (event) => {
				event.stopPropagation();

				window.open(`${GMAIL_URL}/?view=cm&fs=1`);
			});
		}

		searchParams.delete("openComposeInNewWindow");
	}
});
