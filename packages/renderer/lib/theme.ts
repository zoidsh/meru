import { ipc } from "@meru/shared/renderer/ipc";
import type { SystemColors } from "@meru/shared/types";
import { create } from "zustand";
import { darkModeSearchParam, systemColorsSearchParam } from "./search-params";

export const useThemeStore = create<{
  theme: "light" | "dark";
}>(() => ({
  theme: darkModeSearchParam === "true" ? "dark" : "light",
}));

let appliedSystemColorVariables: string[] = [];

// Inline custom properties beat both `:root` and `.dark`, so the native
// palette lands without the stylesheet knowing it exists.
function applySystemColors(colors: SystemColors) {
  const { style } = window.document.documentElement;

  for (const variable of appliedSystemColorVariables) {
    style.removeProperty(variable);
  }

  appliedSystemColorVariables = Object.keys(colors ?? {});

  for (const [variable, color] of Object.entries(colors ?? {})) {
    style.setProperty(variable, color);
  }
}

export function initTheme() {
  if (darkModeSearchParam === "true") {
    window.document.documentElement.classList.add("dark");
  }

  if (systemColorsSearchParam) {
    applySystemColors(JSON.parse(systemColorsSearchParam));
  }

  ipc.renderer.on("theme.systemColorsChanged", (_event, colors) => {
    applySystemColors(colors);
  });

  ipc.renderer.on("theme.darkModeChanged", (_event, darkMode) => {
    window.document.documentElement.classList[darkMode ? "add" : "remove"]("dark");

    useThemeStore.setState({ theme: darkMode ? "dark" : "light" });
  });
}
