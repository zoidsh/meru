import { darkTheme, type DarkThemeController } from "@meru/dark-theme";
import { $ } from "select-dom";

let themedElement: HTMLElement | null = null;
let controller: DarkThemeController | null = null;

export function darkMode() {
  const messageElement = $(".AO .nH.g.id") ?? null;

  if (messageElement === themedElement) {
    return;
  }

  controller?.revert();
  controller = null;
  themedElement = messageElement;

  if (messageElement) {
    controller = darkTheme(messageElement, {
      darkSchemeBackgroundColor: "#131313",
      ignore: [".edeTZ"],
    });
  }
}
