import { GMAIL_URL } from "@/lib/constants";

let urlPreviewElement: HTMLDivElement | null = null;
let timeout: Timer | null = null;

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
			console.warn("Target is not an HTMLElement");
			return;
		}

		const href = lookupHref(event.target);

		if (!href || href.startsWith(GMAIL_URL)) {
			console.warn("URL is not a GMAIL URL");
			return;
		}

		urlPreviewElement = document.createElement("div");

		urlPreviewElement.style.position = "fixed";
		urlPreviewElement.style.left = "0";
		urlPreviewElement.style.bottom = "0";
		urlPreviewElement.style.right = "0";
		urlPreviewElement.style.maxWidth = "50%";
		urlPreviewElement.style.padding = "6px";
		urlPreviewElement.style.fontSize = "0.75rem";
		urlPreviewElement.style.textOverflow = "ellipsis";
		urlPreviewElement.style.overflow = "hidden";
		urlPreviewElement.style.whiteSpace = "nowrap";
		urlPreviewElement.style.color = "white";
		urlPreviewElement.style.background = "black";

		urlPreviewElement.textContent = href;

		document.body.append(urlPreviewElement);

		timeout = setTimeout(() => {
			if (urlPreviewElement) {
				urlPreviewElement.style.maxWidth = "";
			}
		}, 2000);
	});

	window.addEventListener("mouseout", () => {
		if (timeout) {
			clearTimeout(timeout);
			timeout = null;
		}

		if (urlPreviewElement) {
			urlPreviewElement.remove();

			urlPreviewElement = null;
		}
	});
}
