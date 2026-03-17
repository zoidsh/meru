import { create } from "zustand";
import { darkModeSearchParam } from "./search-params";

export const useThemeStore = create<{
  theme: "light" | "dark";
}>(() => ({
  theme: darkModeSearchParam === "true" ? "dark" : "light",
}));
