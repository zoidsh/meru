import { ipcMain } from "./ipc";

let previousUnreadCountString: string = "";

const inboxAnchorElementSelector = 'span > a[href*="#inbox"]';

export function observeUnreadCount() {
  const currentUnreadCountString =
    document.querySelector(`div:has(> ${inboxAnchorElementSelector}) .bsU`)?.textContent || "";

  if (currentUnreadCountString !== previousUnreadCountString) {
    ipcMain.send("gmail.unreadCountChanged", currentUnreadCountString);

    previousUnreadCountString = currentUnreadCountString;
  }
}
