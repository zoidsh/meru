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
      // The coloured starred states use their own icon and must keep it, so they're
      // left out of the blanket icon inversion below.
      ignore: [".edeTZ", ".T-KT.T-KT-Jp", ".T-KT.byM"],
      invertImageUrls: ["https://www.gstatic.com/images/icons/material/system_gm/"],
      css: darkThemeCss,
    });
  }
}
