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
      invertImageUrls: ["https://www.gstatic.com/images/icons/material/system_gm/"],
      // The coloured starred-state icon shares the material-icon path but must keep
      // its colour, so it's excluded from the blanket inversion above.
      invertImageExcludeFilenames: ["star_black_20dp.png"],
      css: darkThemeCss,
    });
  }
}
