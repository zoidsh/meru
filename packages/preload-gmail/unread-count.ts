import { ipcMain } from "./ipc";
import { inboxAnchorElementSelector } from "./lib/selectors";

let previousUnreadCountString: string = "";

export function observeUnreadCount() {
  const currentUnreadCountString =
    document.querySelector(`div:has(> ${inboxAnchorElementSelector}) .bsU`)?.textContent || "";

  if (currentUnreadCountString !== previousUnreadCountString) {
    ipcMain.send("gmail.unreadCountChanged", currentUnreadCountString);

    previousUnreadCountString = currentUnreadCountString;
  }
}
