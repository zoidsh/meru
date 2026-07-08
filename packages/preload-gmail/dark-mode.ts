import { darkTheme } from "@meru/dark-theme";
import { $ } from "select-dom";

let themedElement: HTMLElement | null = null;

export function darkMode() {
  const messageElement = $(".AO .nH.g.id");

  if (!messageElement || messageElement === themedElement) {
    return;
  }

  themedElement = messageElement;

  darkTheme(messageElement, {
    darkSchemeBackgroundColor: "#131313",
    ignore: [".at"],
    observe: true,
  });
}
