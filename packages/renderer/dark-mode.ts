import { ipc } from "@meru/renderer-lib/ipc";
import { darkModeSearchParam } from "@meru/renderer-lib/search-params";
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
