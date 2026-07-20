import { applyDarkTheme, type DarkThemeController } from "@meru/dark-theme";
import { GMAIL_PRELOAD_ARGUMENTS, isGmailMessageHash } from "@meru/shared/gmail";
import { $ } from "select-dom";
import messageCss from "./message.css";

const isFullDarkThemeEnabled = process.argv.includes(GMAIL_PRELOAD_ARGUMENTS.fullDarkTheme);

let themedElement: HTMLElement | null = null;
let controller: DarkThemeController | null = null;

export function darkThemeMessage() {
  if (!isFullDarkThemeEnabled) {
    return;
  }

  const messageElement = (isGmailMessageHash(window.location.hash) && $("div[role=main]")) || null;

  if (messageElement === themedElement) {
    return;
  }

  controller?.destroy();
  controller = null;
  themedElement = messageElement;

  if (messageElement) {
    controller = applyDarkTheme(messageElement, {
      backgroundColor: "rgb(19, 19, 19)",
      ignore: [
        // Conversation labels inside message
        ".edeTZ",
        // Reply container
        { selector: ".HM .I5", properties: ["border-color"] },
        // "More options" button in reply container
        { selector: ".J-JN-M-I", properties: ["background-color"] },
        // "More options" menu items
        { selector: ".J-N", properties: ["background-color"] },
        // "Send" button in reply container
        { selector: ".dC", properties: ["background-color"] },
      ],
      invertImageUrls: [
        "https://www.gstatic.com/images/icons/material/system_gm/",
        "https://ssl.gstatic.com/ui/v1/icons/mail/gm3/",
      ],
      invertImageExcludeFilenames: [
        "star_googyellow500_20dp.png",
        "archive_white_20dp.png",
        "schedule_send_googblue_20dp.png",
        "label_important_fill_googyellow500_20dp.png",
      ],
      css: messageCss,
    });
  }
}
