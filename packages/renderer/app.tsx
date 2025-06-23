import { ipc } from "@meru/renderer-lib/ipc";
import { darkModeSearchParam } from "@meru/renderer-lib/search-params";
import { Toaster } from "@meru/ui/components/sonner";
import { TooltipProvider } from "@meru/ui/components/tooltip";
import { AppMain } from "@/components/app-main";
import { AppTitlebar } from "@/components/app-titlebar";
import { useThemeStore } from "./lib/stores";

if (darkModeSearchParam === "true") {
	window.document.documentElement.classList.add("dark");
}

ipc.renderer.on("theme.darkModeChanged", (_event, darkMode) => {
	window.document.documentElement.classList[darkMode ? "add" : "remove"](
		"dark",
	);

	useThemeStore.setState({ theme: darkMode ? "dark" : "light" });
});

export function App() {
	const theme = useThemeStore((state) => state.theme);

	return (
		<TooltipProvider>
			<div className="h-screen flex flex-col">
				<AppTitlebar />
				<AppMain />
			</div>
			<Toaster theme={theme} />
		</TooltipProvider>
	);
}
