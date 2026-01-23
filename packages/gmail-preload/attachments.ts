import { GMAIL_PRELOAD_ARGUMENTS } from "@meru/shared/gmail";
import { $, $$ } from "select-dom";

const attachmentsSelector = ".hq.gt";
const messageWithAttachmentsSelector = `div:has(> ${attachmentsSelector})`;
const horizontalLineClassName = "hp";

function moveAttachmentsToTop() {
	const messageWithAttachmentsElements = $$(messageWithAttachmentsSelector);

	for (const messageWithAttachmentsElement of messageWithAttachmentsElements) {
		const attachmentsElement = $(
			attachmentsSelector,
			messageWithAttachmentsElement,
		);

		if (
			!attachmentsElement ||
			messageWithAttachmentsElement.firstChild === attachmentsElement
		) {
			continue;
		}

		const horizontalLineElement = document.createElement("div");

		horizontalLineElement.className = horizontalLineClassName;
		horizontalLineElement.style.marginTop = "16px";

		attachmentsElement.append(horizontalLineElement);

		messageWithAttachmentsElement.prepend(attachmentsElement);
	}
}

export function initAttachments() {
	if (!process.argv.includes(GMAIL_PRELOAD_ARGUMENTS.moveAttachmentsToTop)) {
		return;
	}

	moveAttachmentsToTop();

	const observer = new MutationObserver(() => {
		moveAttachmentsToTop();
	});

	observer.observe(document.body, { childList: true, subtree: true });
}
