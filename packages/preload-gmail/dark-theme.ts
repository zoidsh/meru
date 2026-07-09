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
      ignore: [
        // Element containing the conversation labels.
        ".edeTZ",
        // The "be cautious about sharing sensitive information" warning banner.
        ".ac4",
      ],
      invertImageUrls: [
        "https://www.gstatic.com/images/icons/material/system_gm/",
        "https://ssl.gstatic.com/ui/v1/icons/mail/gm3/",
      ],
      invertImageExcludeFilenames: [
        "star_googyellow500_20dp.png",
        "archive_white_20dp.png",
        "schedule_send_googblue_20dp.png",
      ],
      css: darkThemeCss,
    });
  }
}
