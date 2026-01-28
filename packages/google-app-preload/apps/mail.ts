import { GMAIL_PRELOAD_ARGUMENTS } from "@meru/shared/gmail";
import { $ } from "select-dom";
import { ipcMain } from "@/ipc";

const isCloseComposeWindowAfterSendEnabled = process.argv.includes(
	GMAIL_PRELOAD_ARGUMENTS.closeComposeWindowAfterSend,
);

const messageSentElementProcessedAttribute =
	"data-meru-close-compose-window-after-send";

function closeComposeWindowAfterSend() {
	if (!isCloseComposeWindowAfterSendEnabled) {
		return;
	}

	const messageSentElement = $(
		`.vh:has(span[id='link_undo']):has(span[id='link_vsm']):not([${messageSentElementProcessedAttribute}])`,
	);

	if (!messageSentElement) {
		return;
	}

	messageSentElement.setAttribute(messageSentElementProcessedAttribute, "");

	ipcMain.send("gmail.closeComposeWindow");
}

export function initMailPreload() {
	if (/(view|tf)=cm/.test(window.location.search)) {
		document.addEventListener("DOMContentLoaded", () => {
			const observer = new MutationObserver(() => {
				closeComposeWindowAfterSend();
			});

			observer.observe(document.body, { childList: true, subtree: true });
		});

		return;
	}
}
