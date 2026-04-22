import { observeBodyMutations } from "@meru/shared/dom";
import { GMAIL_PRELOAD_ARGUMENTS, isGmailComposeWindowUrl } from "@meru/shared/gmail";
import { $ } from "select-dom";
import { ipcMain, ipcRenderer } from "@/ipc";

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

  ipcMain.send("gmail.closeComposeWindow");

  ipcRenderer.once("gmail.undoMessageSent", () => {
    const undoElement = $("span#link_undo", messageSentElement);

    if (!undoElement) {
      throw new Error("Undo element not found");
    }

    undoElement.click();
  });
}

export function initMailPreload() {
  if (isGmailComposeWindowUrl(window.location.href)) {
    document.addEventListener("DOMContentLoaded", () => {
      observeBodyMutations(closeComposeWindowAfterSend);
    });

    return;
  }
}
