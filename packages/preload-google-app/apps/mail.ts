import { observeBodyMutations } from "@meru/shared/dom";
import { GMAIL_PRELOAD_ARGUMENTS, isGmailComposeWindowUrl } from "@meru/shared/gmail";
import { ipc } from "@meru/shared/renderer/ipc";
import { $ } from "select-dom";

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

export function initMailPreload() {
  if (isGmailComposeWindowUrl(window.location.href)) {
    document.addEventListener("DOMContentLoaded", () => {
      observeBodyMutations(closeComposeWindowAfterSend);
    });

    return;
  }
}
