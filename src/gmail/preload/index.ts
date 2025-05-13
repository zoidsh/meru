import "./electron-api";
import { initInboxObserver } from "./inbox-observer";
import { initIpc } from "./ipc";
import { initUrlPreview } from "./url-preview";

document.addEventListener("DOMContentLoaded", () => {
	const searchParams = new URLSearchParams(window.location.search);

	if (searchParams.get("reverseConversation") === "true") {
		document.documentElement.classList.add("meru-reverse-conversation");
	}

	initIpc();
	initUrlPreview();
	initInboxObserver();
});
