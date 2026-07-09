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
      invertImageUrls: [
        "https://www.gstatic.com/images/icons/material/system_gm/",
        "https://ssl.gstatic.com/ui/v1/icons/mail/gm3/",
      ],
      // Icons under the matched paths that must not be inverted: the coloured
      // starred star, and an already-light archive icon.
      invertImageExcludeFilenames: ["star_googyellow500_20dp.png", "archive_white_20dp.png"],
      css: darkThemeCss,
    });
  }
}
