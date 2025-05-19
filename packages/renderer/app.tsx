import { AppMain } from "@/components/app-main";
import { AppTitlebar } from "@/components/app-titlebar";
import { ipcRenderer } from "@meru/renderer-lib/ipc";
import { darkModeSearchParam } from "@meru/renderer-lib/search-params";
import { Toaster } from "@meru/ui/components/sonner";
import { TooltipProvider } from "@meru/ui/components/tooltip";
import { useThemeStore } from "./lib/stores";

if (darkModeSearchParam === "true") {
	window.document.documentElement.classList.add("dark");
}

ipcRenderer.on("darkModeChanged", (_event, darkMode) => {
	window.document.documentElement.classList[darkMode ? "add" : "remove"](
		"dark",
	);

	useThemeStore.setState({ theme: darkMode ? "dark" : "light" });
});

export function App() {
	const theme = useThemeStore((state) => state.theme);

	return (
		<TooltipProvider>
			<AppTitlebar />
			<AppMain />
			<Toaster theme={theme} />
		</TooltipProvider>
	);
}
