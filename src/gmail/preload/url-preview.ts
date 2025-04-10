import { GMAIL_URL } from "@/lib/constants";

function lookupHref(target: HTMLElement) {
	if (target instanceof HTMLAnchorElement) {
		return target.href;
	}

	if (target.parentElement) {
		return lookupHref(target.parentElement);
	}

	return null;
}

export function initUrlPreview() {
	window.addEventListener("mouseover", (event) => {
		if (!(event.target instanceof HTMLElement)) {
			return;
		}

		const href = lookupHref(event.target);

		if (!href || href.startsWith(GMAIL_URL)) {
			return;
		}

		const urlPreviewElement = document.createElement("div");

		urlPreviewElement.className = "url-preview";

		urlPreviewElement.textContent = href;

		document.body.append(urlPreviewElement);

		const timeout = setTimeout(() => {
			urlPreviewElement.setAttribute("data-long-hover", "true");
		}, 1500);

		const removeUrlPreviewElement = () => {
			clearTimeout(timeout);

			urlPreviewElement.onanimationend = () => {
				urlPreviewElement.remove();
			};

			urlPreviewElement.setAttribute("data-fade-out", "true");

			if (event.target) {
				event.target.removeEventListener("mouseleave", removeUrlPreviewElement);
			}
		};

		event.target.addEventListener("mouseleave", removeUrlPreviewElement);
	});
}
