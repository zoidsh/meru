import { randomUUID } from "node:crypto";
import { APP_TITLEBAR_HEIGHT, BASE_SPACING } from "@meru/shared/constants";
import type { AccountConfig, Bookmark, BookmarkState } from "@meru/shared/schemas";
import type { BookmarksPopupPlacement } from "@meru/shared/types";
import { clamp } from "@meru/shared/utils";
import type { BrowserWindow } from "electron";
import { accounts } from "./accounts";
import { config } from "./config";
import { ipc } from "./ipc";
import { Popup } from "./lib/popup";
import { licenseKey } from "./license-key";

/**
 * The URLs an account has saved. A bookmark keeps the URL, title and app it was
 * created from and never follows what the user browses to afterwards — opening
 * one loads that URL again.
 *
 * A popup is the one surface that lists them, and the titlebar button that opens
 * it is always there — unlike the vertical tabs strip, which is gone in `New
 * Windows` mode and absent in `Tabs` mode until a second tab opens.
 */
class Bookmarks {
  popup = new Popup();

  togglePopup(parentWindow: BrowserWindow, placement: BookmarksPopupPlacement) {
    return this.popup.toggle(parentWindow, {
      content: { page: "bookmarks" },
      width: BASE_SPACING * 40,
      height: "fill",
      anchor:
        placement === "verticalTabs"
          ? {
              x: accounts.getVerticalTabsWidth() + BASE_SPACING,
              y: APP_TITLEBAR_HEIGHT + BASE_SPACING,
              align: "start",
            }
          : undefined,
    });
  }

  /**
   * An account's bookmarks, which the free version has none of. A bookmark
   * opens a workspace app, and those are Pro, so every reader here — the popup,
   * the star on a tab row, opening one — is answered with an empty list rather
   * than gated one at a time. A trial that ended would otherwise have left its
   * bookmarks opening apps indefinitely.
   */
  getAccountBookmarks(accountId: AccountConfig["id"]): Bookmark[] {
    if (!licenseKey.isValid) {
      return [];
    }

    const accountConfig = config.get("accounts").find((account) => account.id === accountId);

    // Accounts written before bookmarks became a list of their own carry none
    return accountConfig?.workspaceApps.bookmarks ?? [];
  }

  private setAccountBookmarks(accountId: AccountConfig["id"], updatedBookmarks: Bookmark[]) {
    // Every list written here is built from the empty one above, so a write
    // without a license would erase the bookmarks a license or a trial made.
    // Activating one brings them back.
    if (!licenseKey.isValid) {
      return;
    }

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

    if (!account.instance.tabs.openInAppLinksTab(openedBookmark.url)) {
      account.instance.tabs.openUrl(openedBookmark.url);
    }

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
