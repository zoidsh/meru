import { ipc } from "@meru/shared/renderer/ipc";
import { create } from "zustand";
import { darkModeSearchParam } from "./search-params";

export const useThemeStore = create<{
  theme: "light" | "dark";
}>(() => ({
  theme: darkModeSearchParam === "true" ? "dark" : "light",
}));

export function initTheme() {
  if (darkModeSearchParam === "true") {
    window.document.documentElement.classList.add("dark");
  }

  ipc.renderer.on("theme.darkModeChanged", (_event, darkMode) => {
    window.document.documentElement.classList[darkMode ? "add" : "remove"]("dark");

    useThemeStore.setState({ theme: darkMode ? "dark" : "light" });
  });
}
