import { darkModeSearchParam } from "@meru/renderer-lib/search-params";
import { createRoot } from "react-dom/client";
import { App } from "./app";

if (darkModeSearchParam === "true") {
	window.document.documentElement.classList.add("dark");
}

const rootElement = document.getElementById("root");

if (rootElement) {
	const root = createRoot(rootElement);

	root.render(<App />);
}
