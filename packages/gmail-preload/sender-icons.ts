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

export function initSenderIcons() {
	addSenderIcons();

	const observer = new MutationObserver(() => {
		addSenderIcons();
	});

	observer.observe(document.body, { childList: true, subtree: true });
}
