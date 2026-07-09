import { applyDarkTheme, type DarkThemeController } from "@meru/dark-theme";
import { $ } from "select-dom";
import darkThemeCss from "./dark-theme.css";

let themedElement: HTMLElement | null = null;
let controller: DarkThemeController | null = null;

export function darkTheme() {
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
      css: darkThemeCss,
    });
  }
}
