import { applyDarkTheme, type DarkThemeController } from "@meru/dark-theme";
import { GMAIL_PRELOAD_ARGUMENTS } from "@meru/shared/gmail";
import { $ } from "select-dom";

const isFullDarkThemeEnabled = process.argv.includes(GMAIL_PRELOAD_ARGUMENTS.fullDarkTheme);

let themedElement: HTMLElement | null = null;
let controller: DarkThemeController | null = null;

export function darkThemeMessage() {
  if (!isFullDarkThemeEnabled) {
    return;
  }

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
        // The generative-AI chip ("Add to Calendar" etc.): its :hover gradient comes from
        // cross-origin genai tokens the engine can't darken, so keep the whole chip native.
        ".o03h8b",
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
    });
  }
}
