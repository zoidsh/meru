import "@meru/shared/electron-api";
import "./ipc";
import { observeBodyMutations } from "@meru/shared/dom";
import { ipc } from "@meru/shared/renderer/ipc";
import { observePageScrollEdge } from "@meru/shared/renderer/scroll-edge";
import { moveAttachmentsToTop } from "./attachments";
import { loadClippedMessages } from "./clipped-messages";
import { openComposeInNewWindow } from "./compose";
import { initCss } from "./css";
import { darkThemeCompose } from "./dark-theme/compose";
import { darkThemeMessage } from "./dark-theme/message";
import { observeOutOfOfficeBanner } from "./out-of-office";
import { replyForwardInPopOut } from "./reply-forward";
import { addSenderIcons } from "./sender-icons";
import { observeUnreadCount } from "./unread-count";
import { initUrlPreview } from "./url-preview";
import { setUserEmail } from "./user-email";

const features = [
  observeUnreadCount,
  observeOutOfOfficeBanner,
  addSenderIcons,
  moveAttachmentsToTop,
  loadClippedMessages,
  openComposeInNewWindow,
  setUserEmail,
  replyForwardInPopOut,
  darkThemeMessage,
  darkThemeCompose,
];

// Only macOS swipes between pages, and elsewhere the reads would cost every
// pointer move for nothing.
if (process.platform === "darwin") {
  observePageScrollEdge((pageScrollEdge) => {
    ipc.main.send("swipeNavigation.setPageScrollEdge", pageScrollEdge);
  });
}

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

  observeBodyMutations(runFeatures);
});
