import { QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { AppMain } from "./components/app-main";
import { AppTitlebar } from "./components/app-titlebar";
import { ipcRenderer } from "./lib/ipc";
import { queryClient } from "./lib/react-query";

const searchParams = new URLSearchParams(window.location.search);

const darkMode = searchParams.get("darkMode");

if (darkMode === "true") {
	window.document.documentElement.classList.add("dark");
}

ipcRenderer.on("onDarkModeChanged", (_event, darkMode) => {
	window.document.documentElement.classList[darkMode ? "add" : "remove"](
		"dark",
	);
});

const rootElement = document.getElementById("root");

if (!rootElement) {
	throw new Error("Root element not found");
}

const root = createRoot(rootElement);

root.render(
	<QueryClientProvider client={queryClient}>
		<AppTitlebar />
		<AppMain />
	</QueryClientProvider>,
);
