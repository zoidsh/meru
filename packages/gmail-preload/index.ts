import elementReady from "element-ready";
import "./electron-api";
import { GMAIL_COMPOSE_URL } from "@meru/shared/gmail";
import { initInboxObserver } from "./inbox-observer";
import { initIpc } from "./ipc";
import { initOutOfOfficeDetection } from "./out-of-office";
import { initSenderIcons } from "./sender-icons";
import { initUrlPreview } from "./url-preview";

document.addEventListener("DOMContentLoaded", async () => {
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

	if (process.argv.includes("--hide-out-of-office-banner")) {
		document.documentElement.classList.add("hide-out-of-office-banner");
	}

	initIpc();
	initUrlPreview();
	initInboxObserver();
	initOutOfOfficeDetection();

	if (process.argv.includes("--show-sender-icons")) {
		initSenderIcons();
	}

	if (searchParams.get("openComposeInNewWindow") === "true") {
		const composeButtonElement = await elementReady(".T-I.T-I-KE.L3", {
			stopOnDomReady: false,
		});

		if (composeButtonElement) {
			composeButtonElement.addEventListener("click", (event) => {
				event.stopPropagation();

				window.open(GMAIL_COMPOSE_URL);
			});
		}
	}
});
