import { ipcMain } from "./ipc";

declare global {
  interface Window {
    GM_INBOX_TYPE: "CLASSIC" | "SECTIONED";
    GM_ID_KEY: string;
  }
}

let previousUnreadCountString: string = "";

const inboxAnchorElementSelector = 'span > a[href*="#inbox"]';

export function observeUnreadCount() {
  const currentUnreadCountString =
    document.querySelector(`div:has(> ${inboxAnchorElementSelector}) .bsU`)?.textContent || "";

  if (currentUnreadCountString !== previousUnreadCountString) {
    ipcMain.send("gmail.unreadCountChanged", currentUnreadCountString, window.GM_INBOX_TYPE);

    previousUnreadCountString = currentUnreadCountString;
  }
}
