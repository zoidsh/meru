import { QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { AppMain } from "./components/app-main";
import { AppTitlebar } from "./components/app-titlebar";
import { ipcRenderer } from "./lib/ipc";
import { queryClient } from "./lib/react-query";

const searchParams = new URLSearchParams(window.location.search);

if (searchParams.get("darkMode") === "true") {
	window.document.documentElement.classList.add("dark");
}

ipcRenderer.on("darkModeChanged", (_event, darkMode) => {
	window.document.documentElement.classList[darkMode ? "add" : "remove"](
		"dark",
	);
});

ipcRenderer.on("isSettingsOpenChanged", (_event, isSettingsOpen) => {
	queryClient.setQueryData(["isSettingsOpen"], isSettingsOpen);
});

ipcRenderer.on("accountsChanged", (_event, accounts) => {
	queryClient.setQueryData(["accounts"], accounts);
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
