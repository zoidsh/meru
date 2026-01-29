import { Toaster } from "@meru/ui/components/sonner";
import { createRoot } from "react-dom/client";
import globalStyles from "./globals.css?inline";

const ROOT_ELEMENT_ID = "meru-toaster";

export function initToaster() {
	const shadowHost = document.createElement("div");

	shadowHost.id = ROOT_ELEMENT_ID;

	const shadowRoot = shadowHost.attachShadow({ mode: "open" });

	const styleElement = document.createElement("style");
	styleElement.textContent = globalStyles;
	shadowRoot.appendChild(styleElement);

	const rootElement = document.createElement("div");
	rootElement.className = "dark";
	shadowRoot.appendChild(rootElement);

	const reactRoot = createRoot(rootElement);

	reactRoot.render(<Toaster theme="dark" />);

	document.body.appendChild(shadowHost);
}
