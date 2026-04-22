import "@meru/shared/electron-api";
import "./ipc";
import { observeBodyMutations } from "@meru/shared/dom";
import { moveAttachmentsToTop } from "./attachments";
import { openComposeInNewWindow } from "./compose";
import { initCss } from "./css";
import { observeOutOfOfficeBanner } from "./out-of-office";
import { addSenderIcons } from "./sender-icons";
import { initToaster } from "./toaster";
import { initUrlPreview } from "./url-preview";
import { observeUnreadCount } from "./unread-count";
import { replyForwardInPopOut } from "./reply-forward";
import { setUserEmail } from "./user-email";

const features = [
  observeUnreadCount,
  observeOutOfOfficeBanner,
  addSenderIcons,
  moveAttachmentsToTop,
  openComposeInNewWindow,
  setUserEmail,
  replyForwardInPopOut,
];

function runFeatures() {
  for (const feature of features) {
    try {
      feature();
    } catch (error) {
      console.error("Error running feature:", error);
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  if (window.location.hostname !== "mail.google.com") {
    return;
  }

  initCss();
  initUrlPreview();
  initToaster();

  observeBodyMutations(runFeatures);
});
