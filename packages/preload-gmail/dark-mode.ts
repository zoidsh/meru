import { darkTheme } from "@meru/dark-theme";
import { $ } from "select-dom";

export function darkMode() {
  const messageElement = $(".AO .nH.g.id");

  if (!messageElement) {
    return;
  }

  darkTheme(messageElement);
}
