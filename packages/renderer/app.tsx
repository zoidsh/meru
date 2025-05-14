import "@fontsource-variable/inter";
import { AppMain } from "@/components/app-main";
import { AppTitlebar } from "@/components/app-titlebar";
import { ipcRenderer } from "@/lib/ipc";
import { darkModeSearchParam } from "@/lib/search-params";
import { TooltipProvider } from "@meru/ui/components/tooltip";
import { createRoot } from "react-dom/client";

if (darkModeSearchParam === "true") {
	window.document.documentElement.classList.add("dark");
}

ipcRenderer.on("darkModeChanged", (_event, darkMode) => {
	window.document.documentElement.classList[darkMode ? "add" : "remove"](
		"dark",
	);
});

const rootElement = document.getElementById("root");

if (rootElement) {
	const root = createRoot(rootElement);

	root.render(
		<TooltipProvider delayDuration={0}>
			<AppTitlebar />
			<AppMain />
		</TooltipProvider>,
	);
}
