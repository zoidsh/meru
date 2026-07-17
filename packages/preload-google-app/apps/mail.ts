import { applyDarkTheme, type DarkThemeController } from "@meru/dark-theme";
import { observeBodyMutations } from "@meru/shared/dom";
import { GMAIL_PRELOAD_ARGUMENTS, isGmailComposeWindowUrl } from "@meru/shared/gmail";
import { ipc } from "@meru/shared/renderer/ipc";
import { $ } from "select-dom";
import mailCss from "./mail.css";

const isCloseComposeWindowAfterSendEnabled = process.argv.includes(
  GMAIL_PRELOAD_ARGUMENTS.closeComposeWindowAfterSend,
);

const messageSentElementProcessedAttribute = "data-meru-close-compose-window-after-send";

function closeComposeWindowAfterSend() {
  if (!isCloseComposeWindowAfterSendEnabled) {
    return;
  }

  const messageSentElement = $(
    `.vh:has(span[id='link_undo']):has(span[id='link_vsm']):not([${messageSentElementProcessedAttribute}])`,
  );

  if (!messageSentElement) {
    return;
  }

  messageSentElement.setAttribute(messageSentElementProcessedAttribute, "");

  ipc.main.send("gmail.closeComposeWindow");

  ipc.renderer.once("gmail.undoMessageSent", () => {
    const undoElement = $("span#link_undo", messageSentElement);

    if (!undoElement) {
      throw new Error("Undo element not found");
    }

    undoElement.click();
  });
}

const isFullDarkThemeEnabled = process.argv.includes(GMAIL_PRELOAD_ARGUMENTS.fullDarkTheme);

let themedElement: HTMLElement | null = null;
let controller: DarkThemeController | null = null;

function darkThemeMail() {
  if (!isFullDarkThemeEnabled) {
    return;
  }

  const rootElement = $(".nH") ?? null;

  if (rootElement === themedElement) {
    return;
  }

  controller?.destroy();
  controller = null;
  themedElement = rootElement;

  if (rootElement) {
    controller = applyDarkTheme(rootElement, {
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
        "arrow_drop_down_white_20dp.png",
      ],
      css: mailCss,
    });
  }
}

export function initMailPreload() {
  document.addEventListener("DOMContentLoaded", () => {
    if (isGmailComposeWindowUrl(window.location.href)) {
      observeBodyMutations(() => {
        closeComposeWindowAfterSend();
        darkThemeMail();
      });
    }
  });
}
