import { GMAIL_PRELOAD_ARGUMENTS } from "@meru/shared/gmail";
import { $, $$, elementExists } from "select-dom";

const senderIconSize = 16;
const senderIconsElementId = "meru-sender-icons";

function addSenderIcons() {
	const emailElements = $$("tr[id]:has(span[email*='@'])");

	for (const emailElement of emailElements) {
		if (elementExists(`#${senderIconsElementId}`, emailElement)) {
			continue;
		}

		const senderColumnElement = $("td:has(span[email*='@'])", emailElement);

		if (!senderColumnElement) {
			continue;
		}

		const senderElements = $$("span[email*='@']", senderColumnElement);

		const senderDomains = new Set<string>();

		for (const senderElement of senderElements) {
			const senderDomain = senderElement.getAttribute("email")?.split("@")[1];

			if (senderDomain) {
				senderDomains.add(senderDomain);
			}
		}

		const senderIconsElement = document.createElement("td");

		senderIconsElement.id = senderIconsElementId;
		senderIconsElement.className = "xY";
		senderIconsElement.style.minWidth = `${senderIconSize * 2}px`;
		senderIconsElement.style.marginRight = `${senderIconSize / 4}px`;

		let senderIconIndex = 0;

		for (const senderDomain of senderDomains) {
			const senderIconElement = document.createElement("img");

			senderIconElement.src = `https://www.google.com/s2/favicons?domain=${senderDomain}&sz=${senderIconSize * 2}`;
			senderIconElement.title = senderDomain;
			senderIconElement.style.width = `${senderIconSize}px`;
			senderIconElement.style.height = `${senderIconSize}px`;
			senderIconElement.style.borderRadius = "50%";
			senderIconElement.style.backgroundColor = "#ffffff";

			if (senderIconIndex > 0) {
				senderIconElement.style.marginLeft = `-${senderIconSize / 2}px`;
			}

			senderIconsElement.appendChild(senderIconElement);

			senderIconIndex++;
		}

		emailElement.insertBefore(senderIconsElement, senderColumnElement);
	}
}

function expandMessagePreview() {
	const messageElements = $$(".xS[role='link']:has(.y6):has(.y2)");

	for (const messageElement of messageElements) {
		const previewElement = $(".y2", messageElement);

		if (!previewElement || messageElement.lastChild === previewElement) {
			continue;
		}

		const separatorElement = $(".Zt", previewElement);

		if (separatorElement) {
			separatorElement.remove();
		}

		previewElement.style.display = "-webkit-box";
		previewElement.style.webkitBoxOrient = "vertical";
		previewElement.style.whiteSpace = "normal";
		previewElement.style.overflow = "hidden";
		previewElement.style.webkitLineClamp = "2";

		messageElement.append(previewElement);
	}
}

export function initSenderIcons() {
	if (process.argv.includes(GMAIL_PRELOAD_ARGUMENTS.showSenderIcons)) {
		addSenderIcons();
		expandMessagePreview();

		const observer = new MutationObserver(() => {
			addSenderIcons();
			expandMessagePreview();
		});

		observer.observe(document.body, { childList: true, subtree: true });
	}
}
