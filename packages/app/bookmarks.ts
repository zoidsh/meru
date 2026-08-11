import { randomUUID } from "node:crypto";
import { BASE_SPACING } from "@meru/shared/constants";
import type { AccountConfig, Bookmark, BookmarkState } from "@meru/shared/schemas";
import { clamp } from "@meru/shared/utils";
import { accounts } from "./accounts";
import { config } from "./config";
import { ipc } from "./ipc";
import { TitlebarPopup } from "./lib/titlebar-popup";

/**
 * The URLs an account has saved. A bookmark keeps the URL, title and app it was
 * created from and never follows what the user browses to afterwards — opening
 * one loads that URL again.
 *
 * Bookmarks render in the vertical tabs strip, which `New Windows` mode hides
 * entirely — so the titlebar carries a popup of its own to keep them reachable,
 * and it is the only surface that lists them when there is no strip.
 */
class Bookmarks {
  popup = new TitlebarPopup({
    page: "bookmarks",
    width: BASE_SPACING * 40,
    height: BASE_SPACING * 44,
  });

  getAccountBookmarks(accountId: AccountConfig["id"]): Bookmark[] {
    const accountConfig = config.get("accounts").find((account) => account.id === accountId);

    // Accounts written before bookmarks became a list of their own carry none
    return accountConfig?.workspaceApps.bookmarks ?? [];
  }

  private setAccountBookmarks(accountId: AccountConfig["id"], updatedBookmarks: Bookmark[]) {
    config.set(
      "accounts",
      config.get("accounts").map((accountConfig) =>
        accountConfig.id === accountId
          ? {
              ...accountConfig,
              workspaceApps: {
                ...accountConfig.workspaceApps,
                bookmarks: updatedBookmarks,
              },
            }
          : accountConfig,
      ),
    );
  }

  isBookmarked(accountId: AccountConfig["id"], url: string) {
    return this.getAccountBookmarks(accountId).some((bookmark) => bookmark.url === url);
  }

  /**
   * Saves the given URL, or drops what is saved for it — the surfaces that
   * offer bookmarking are toggles on the URL they are showing.
   */
  toggle(accountId: AccountConfig["id"], { app, url, title }: Omit<Bookmark, "id">) {
    const accountBookmarks = this.getAccountBookmarks(accountId);

    const remainingBookmarks = accountBookmarks.filter((bookmark) => bookmark.url !== url);

    this.setAccountBookmarks(
      accountId,
      remainingBookmarks.length < accountBookmarks.length
        ? remainingBookmarks
        : [...accountBookmarks, { id: randomUUID(), app, url, title }],
    );
  }

  remove(accountId: AccountConfig["id"], bookmarkId: Bookmark["id"]) {
    this.setAccountBookmarks(
      accountId,
      this.getAccountBookmarks(accountId).filter((bookmark) => bookmark.id !== bookmarkId),
    );
  }

  move(accountId: AccountConfig["id"], bookmarkId: Bookmark["id"], targetIndex: number) {
    const accountBookmarks = this.getAccountBookmarks(accountId);

    const movedBookmark = accountBookmarks.find((bookmark) => bookmark.id === bookmarkId);

    if (!movedBookmark) {
      return;
    }

    const remainingBookmarks = accountBookmarks.filter((bookmark) => bookmark.id !== bookmarkId);

    remainingBookmarks.splice(clamp(targetIndex, 0, remainingBookmarks.length), 0, movedBookmark);

    this.setAccountBookmarks(accountId, remainingBookmarks);
  }

  open(accountId: AccountConfig["id"], bookmarkId: Bookmark["id"]) {
    const openedBookmark = this.getAccountBookmarks(accountId).find(
      (bookmark) => bookmark.id === bookmarkId,
    );

    if (!openedBookmark) {
      return;
    }

    const account = accounts.getAccount(accountId);

    account.instance.tabs.openUrl(openedBookmark.url);

    if (account.config.selected) {
      accounts.refreshSelectedAccountView();
    } else {
      accounts.selectAccount(accountId);
    }
  }

  serialize(): BookmarkState[] {
    const selectedAccount = accounts.getSelectedAccount();

    return this.getAccountBookmarks(selectedAccount.config.id).map((bookmark) => ({
      ...bookmark,
      accountId: selectedAccount.config.id,
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
