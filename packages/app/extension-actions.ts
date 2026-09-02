import { APP_TITLEBAR_HEIGHT } from "@meru/shared/constants";
import type { ExtensionActionAnchorRect } from "@meru/shared/types";
import { BrowserWindow, Menu, type NativeImage, nativeImage, type WebContents } from "electron";
import { accounts } from "./accounts";
import { extensions } from "./extensions";
import { ipc } from "./ipc";
import { Popup } from "./lib/popup";
import { main } from "./main";
import { openExternalUrl } from "./url";
import { WorkspaceApp } from "./workspace-app";

/** The size a menu item's icon is drawn at. */
const MENU_ICON_SIZE = 16;

/**
 * A data URL carries no scale factor for Electron to work the density out
 * from, so an icon built from one is drawn at 1x wherever it lands and comes
 * out blurry on the 2x display that is the common case. Carrying a
 * representation per factor is what tells Electron which pixels to draw.
 */
const MENU_ICON_SCALE_FACTORS = [1, 2];

/**
 * Action icons are read at twice the size a menu draws them at, so every
 * representation scales down from the one source.
 */
function createMenuIcon(iconDataUrl: string) {
  const sourceIcon = nativeImage.createFromDataURL(iconDataUrl);

  // An icon `nativeImage` cannot decode — an SVG one — comes back empty
  if (sourceIcon.isEmpty()) {
    return null;
  }

  const menuIcon = nativeImage.createEmpty();

  for (const scaleFactor of MENU_ICON_SCALE_FACTORS) {
    const size = MENU_ICON_SIZE * scaleFactor;

    menuIcon.addRepresentation({
      scaleFactor,
      // The icon is built once per extension rather than once per menu open, so
      // the slowest filter costs nothing a menu open pays for
      dataURL: sourceIcon.resize({ width: size, height: size, quality: "best" }).toDataURL(),
    });
  }

  return menuIcon;
}

/**
 * The titlebar button listing the extensions loaded into an account's session,
 * and the popup picking one from that list opens.
 *
 * Extensions load into every account, so every titlebar shows the same list —
 * the session a window belongs to only determines which of an extension's
 * per-account instances the popup runs against.
 */
class ExtensionActions {
  popup = new Popup();

  /**
   * One menu icon per extension, built on the first menu that draws it: the
   * menu is rebuilt on every open, and decoding a data URL and resizing it once
   * per scale factor is far more than an open should cost. `null` is an icon
   * `nativeImage` could not decode, kept so that decode isn't retried either.
   *
   * An action never changes while its extension runs, so loading and unloading
   * are the only things the icons can go stale on, and `onActionsChanged` is
   * exactly those.
   */
  private menuIcons = new Map<string, NativeImage | null>();

  init() {
    extensions.onActionsChanged(() => {
      this.menuIcons.clear();

      this.broadcast();
    });
  }

  private getMenuIcon(extensionId: string, iconDataUrl: string | null) {
    if (!iconDataUrl) {
      return undefined;
    }

    let menuIcon = this.menuIcons.get(extensionId);

    if (menuIcon === undefined) {
      menuIcon = createMenuIcon(iconDataUrl);

      this.menuIcons.set(extensionId, menuIcon);
    }

    return menuIcon ?? undefined;
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

  private openPopup(
    parentWindow: BrowserWindow,
    webContents: WebContents,
    extensionId: string,
    anchorRect: ExtensionActionAnchorRect,
  ) {
    if (parentWindow.isDestroyed()) {
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

    const opened = this.popup.toggle(parentWindow, {
      content: { url: action.popupUrl, session },
      width: "preferred",
      height: "preferred",
      // The button sits in the titlebar, so the popup hangs from the bottom of
      // it rather than from the button, whose own bottom edge is a few pixels
      // short of it
      anchor: { x: anchorRect.x + anchorRect.width, y: APP_TITLEBAR_HEIGHT, align: "end" },
    });

    // The menu the popup was picked from is gone by the time it opens, so
    // nothing holds the blur off the way hovering a button that toggles a popup
    // does — a click anywhere else closes it
    this.popup.closeOnBlurEnabled = true;

    // A link out of the popup — "open 1password.com", a vault item's website —
    // opens a browser tab in Chrome. The default browser is Meru's equivalent;
    // the window Electron would otherwise create belongs to no titlebar and
    // none of the app's navigation policing
    if (opened) {
      this.popup.webContents?.setWindowOpenHandler(({ url }) => {
        openExternalUrl(url);

        return { action: "deny" };
      });
    }
  }

  showMenu(webContents: WebContents, anchorRect: ExtensionActionAnchorRect) {
    const parentWindow = BrowserWindow.fromWebContents(webContents);

    if (!parentWindow) {
      return;
    }

    // A click on the button lands here through the blur that closes an open
    // popup, so the menu takes over rather than opening on top of one
    this.popup.close();

    const menu = Menu.buildFromTemplate(
      this.serialize(webContents).map(({ extensionId, title, iconDataUrl }) => ({
        label: title,
        icon: this.getMenuIcon(extensionId, iconDataUrl),
        click: () => {
          this.openPopup(parentWindow, webContents, extensionId, anchorRect);
        },
      })),
    );

    menu.popup({ window: parentWindow, x: anchorRect.x, y: anchorRect.y + anchorRect.height });
  }
}

export const extensionActions = new ExtensionActions();
