import { applyDarkTheme, type DarkThemeController } from "@meru/dark-theme";
import { $ } from "select-dom";
import darkModeCss from "./dark-mode.css";

let themedElement: HTMLElement | null = null;
let controller: DarkThemeController | null = null;

export function darkMode() {
  const messageElement = $(".AO .nH.g.id") ?? null;

  if (messageElement === themedElement) {
    return;
  }

  controller?.destroy();
  controller = null;
  themedElement = messageElement;

  if (messageElement) {
    controller = applyDarkTheme(messageElement, {
      darkSchemeBackgroundColor: "#131313",
      ignore: [".edeTZ"],
      css: darkModeCss,
    });
  }
}
