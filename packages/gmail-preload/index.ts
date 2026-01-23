import "./electron-api";
import { initCompose } from "./compose";
import { initCss } from "./css";
import { initInboxObserver } from "./inbox-observer";
import { initIpc } from "./ipc";
import { initOutOfOffice } from "./out-of-office";
import { initSenderIcons } from "./sender-icons";
import { initUrlPreview } from "./url-preview";

document.addEventListener("DOMContentLoaded", async () => {
	if (window.location.hostname !== "mail.google.com") {
		return;
	}

	initCss();
	initIpc();
	initUrlPreview();
	initInboxObserver();
	initOutOfOffice();
	initSenderIcons();
	initCompose();
});
