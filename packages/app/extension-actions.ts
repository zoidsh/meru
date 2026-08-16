import { APP_TITLEBAR_HEIGHT } from "@meru/shared/constants";
import type { ExtensionActionAnchorRect } from "@meru/shared/types";
import { BrowserWindow, type WebContents } from "electron";
import { accounts } from "./accounts";
import { extensions } from "./extensions";
import { ipc } from "./ipc";
import { Popup } from "./lib/popup";
import { main } from "./main";
import { WorkspaceApp } from "./workspace-app";

/**
 * The titlebar buttons of the extensions loaded into an account's session, and
 * the popup a click on one opens.
 *
 * Extensions load into every account, so every titlebar shows the same buttons
 * — the session a window belongs to only decides which of an extension's
 * per-account instances the popup runs against.
 */
class ExtensionActions {
  popup = new Popup();

  init() {
    extensions.onActionsChanged(() => {
      this.broadcast();
    });
  }

  /**
   * The account a window shows: the one a workspace app window was opened for,
   * and whichever is selected for the main window.
   */
  private getWindowSession(webContents: WebContents) {
    const workspaceApp = WorkspaceApp.tryFromWebContents(webContents);

    return workspaceApp
      ? workspaceApp.account.instance.session
      : accounts.getSelectedAccount().instance.session;
  }

  serialize(webContents: WebContents) {
    return extensions
      .getSessionActions(this.getWindowSession(webContents))
      .map(({ extensionId, title, iconDataUrl }) => ({ extensionId, title, iconDataUrl }));
  }

  private broadcast() {
    const windows = [
      ...(main.window.isDestroyed() ? [] : [main.window]),
      ...WorkspaceApp.getAllWindows(),
    ];

    for (const { webContents } of windows) {
      ipc.renderer.send(webContents, "extensions.actionsChanged", this.serialize(webContents));
    }
  }

  togglePopup(
    webContents: WebContents,
    extensionId: string,
    anchorRect: ExtensionActionAnchorRect,
  ) {
    const parentWindow = BrowserWindow.fromWebContents(webContents);

    if (!parentWindow) {
      return;
    }

    const session = this.getWindowSession(webContents);

    const action = extensions
      .getSessionActions(session)
      .find((sessionAction) => sessionAction.extensionId === extensionId);

    if (!action?.popupUrl) {
      // TODO: an extension that declares no popup expects `chrome.action.onClicked`
      // in its service worker instead. Electron implements no part of
      // `chrome.action` — it ships Chromium's schema for the namespace with
      // every function marked unsupported — so there is no event to fire and no
      // channel to fire it through short of the facade shadowing the namespace.
      // Nothing Meru loads declares an action without a popup.
      return;
    }

    this.popup.toggle(parentWindow, {
      content: { url: action.popupUrl, session },
      width: "preferred",
      height: "preferred",
      // The button sits in the titlebar, so the popup hangs from the bottom of
      // it rather than from the button, whose own bottom edge is a few pixels
      // short of it
      anchor: { x: anchorRect.x + anchorRect.width, y: APP_TITLEBAR_HEIGHT, align: "end" },
    });
  }
}

export const extensionActions = new ExtensionActions();
