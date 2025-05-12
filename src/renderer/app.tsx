import "@fontsource-variable/inter";
import { createRoot } from "react-dom/client";
import { AppMain } from "./components/app-main";
import { AppTitlebar } from "./components/app-titlebar";
import { TooltipProvider } from "./components/ui/tooltip";
import { ipcRenderer } from "./lib/ipc";
import { darkModeSearchParam } from "./lib/search-params";

if (darkModeSearchParam === "true") {
	window.document.documentElement.classList.add("dark");
}

ipcRenderer.on("darkModeChanged", (_event, darkMode) => {
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
	<TooltipProvider delayDuration={0}>
		<AppTitlebar />
		<AppMain />
	</TooltipProvider>,
);
