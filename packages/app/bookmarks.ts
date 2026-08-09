import { BASE_SPACING } from "@meru/shared/constants";
import { type BookmarkState, getBookmarkedTabs } from "@meru/shared/tabs";
import { accounts } from "./accounts";
import { ipc } from "./ipc";
import { TitlebarPopup } from "./lib/titlebar-popup";

/**
 * Bookmarked entries render in the vertical tabs strip, which `New Windows`
 * mode hides entirely — so the titlebar carries a popup of its own to keep them
 * reachable, and it is the only surface that lists them when there is no strip.
 */
class Bookmarks {
  popup = new TitlebarPopup({
    page: "bookmarks",
    width: BASE_SPACING * 40,
    height: BASE_SPACING * 44,
  });

  serialize(): BookmarkState[] {
    const selectedAccount = accounts.getSelectedAccount();

    return getBookmarkedTabs(selectedAccount.instance.tabs.serialize()).map((tab) => ({
      accountId: selectedAccount.config.id,
      tabId: tab.id,
      app: tab.app,
      title: tab.title,
      windowed: tab.windowed,
    }));
  }

  sendChangedToPopup() {
    const popupWebContents = this.popup.webContents;

    if (!popupWebContents) {
      return;
    }

    ipc.renderer.send(popupWebContents, "bookmarks.changed", this.serialize());
  }
}

export const bookmarks = new Bookmarks();
