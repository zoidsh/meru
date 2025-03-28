import { GMAIL_URL } from "@/lib/constants";

let urlPreviewElement: HTMLDivElement | null = null;

export function initUrlPreview() {
	window.addEventListener("mouseover", (event) => {
		const target = event.target as HTMLAnchorElement | HTMLElement;

		if ("href" in target && !target.href.startsWith(GMAIL_URL)) {
			urlPreviewElement = document.createElement("div");

			urlPreviewElement.className = "meru-url-preview";

			urlPreviewElement.style.color = "white";

			urlPreviewElement.style.background = "black";

			urlPreviewElement.textContent = target.href;

			document.body.append(urlPreviewElement);
		}
	});

	window.addEventListener("mouseout", () => {
		if (urlPreviewElement) {
			urlPreviewElement.remove();

			urlPreviewElement = null;
		}
	});
}
