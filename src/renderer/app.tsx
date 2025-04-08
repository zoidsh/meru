import { createRoot } from "react-dom/client";
import { AppMain } from "./components/app-main";
import { AppTitlebar } from "./components/app-titlebar";
import { ipcRenderer } from "./lib/ipc";
import { useAccountsStore, useSettingsStore } from "./lib/stores";

const searchParams = new URLSearchParams(window.location.search);

if (searchParams.get("darkMode") === "true") {
	window.document.documentElement.classList.add("dark");
}

ipcRenderer.on("darkModeChanged", (_event, darkMode) => {
	window.document.documentElement.classList[darkMode ? "add" : "remove"](
		"dark",
	);
});

const accountsParam = searchParams.get("accounts");

if (accountsParam) {
	useAccountsStore.setState({ accounts: JSON.parse(accountsParam) });
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
	<>
		<AppTitlebar />
		<AppMain />
	</>,
);
