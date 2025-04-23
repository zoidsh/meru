import { createRoot } from "react-dom/client";
import { AppMain } from "./components/app-main";
import { AppTitlebar } from "./components/app-titlebar";
import { TooltipProvider } from "./components/ui/tooltip";
import { ipcRenderer } from "./lib/ipc";
import { accountsSearchParam, darkModeSearchParam } from "./lib/search-params";
import { useAccountsStore, useSettingsStore } from "./lib/stores";

if (darkModeSearchParam === "true") {
	window.document.documentElement.classList.add("dark");
}

ipcRenderer.on("darkModeChanged", (_event, darkMode) => {
	window.document.documentElement.classList[darkMode ? "add" : "remove"](
		"dark",
	);
});

if (accountsSearchParam) {
	useAccountsStore.setState({ accounts: JSON.parse(accountsSearchParam) });
}

ipcRenderer.on("accountsChanged", (_event, accounts) => {
	useAccountsStore.setState({ accounts });
});

ipcRenderer.on("isSettingsOpenChanged", (_event, isSettingsOpen) => {
	useSettingsStore.setState({ isOpen: isSettingsOpen });
});

const rootElement = document.getElementById("root");

if (!rootElement) {
	throw new Error("Root element not found");
}

const root = createRoot(rootElement);

root.render(
	<TooltipProvider delayDuration={0}>
		<AppTitlebar />
		<AppMain />
	</TooltipProvider>,
);
