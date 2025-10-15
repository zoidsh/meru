import { createRoot } from "react-dom/client";
import { App } from "./app";
import "./notifications";
import "./dark-mode";
import "./ipc";

const rootElement = document.getElementById("root");

if (rootElement) {
	const root = createRoot(rootElement);

	root.render(<App />);
}
