import type { App } from "#core/apps.ts";
import type { Log } from "#core/log.ts";
import { gmailOwnWindow } from "#core/state.ts";
import type { TabKey } from "#core/tabs.ts";
import type { createAppLifecycle } from "#platform/app.ts";
import type { createContextMenus } from "#platform/context-menu.ts";
import type { createDisplays } from "#platform/displays.ts";
import { createOwnWindowFactory } from "#platform/own-window.ts";

import type { Focus, FocusTarget } from "../focus.ts";
import { createOwnWindows } from "../own-windows.ts";
import type { Profiles } from "../profiles.ts";
import type { createShellWindow } from "../shell-window.ts";
import { revealWindow } from "../windows.ts";
import type { wireFrameColors } from "./frame-colors.ts";

/** The longest a quit waits for the last writes of the stores. */
const QUIT_WAIT_MS = 3000;

/**
 * Where keys go in a tab's own window: its card while one is open there,
 * else its find bar while open, else its page.
 */
export const inOwnWindow = (key: TabKey): FocusTarget[] => [
  { kind: "windowCard", key },
  { kind: "windowFind", key },
  { kind: "window", key },
];

/**
 * The windows tabs are moved into, kept in their colours and titles and
 * where they were, and what brings one, or the window showing Gmail, forward.
 */
export const wireOwnWindows = ({
  apps,
  isMacOS,
  background,
  isTestBackground,
  lifecycle,
  contextMenus,
  displays,
  frameColors,
  shell,
  profiles,
  storesSettled,
  focus,
  log,
}: {
  apps: readonly App[];
  isMacOS: boolean;
  background: boolean;
  isTestBackground: boolean;
  lifecycle: ReturnType<typeof createAppLifecycle>;
  contextMenus: ReturnType<typeof createContextMenus>;
  displays: ReturnType<typeof createDisplays>;
  frameColors: Pick<
    ReturnType<typeof wireFrameColors>,
    "ownWindow" | "onChange"
  >;
  shell: ReturnType<typeof createShellWindow>;
  profiles: Profiles;
  storesSettled: () => Promise<unknown>;
  focus: Focus;
  log: Log;
}) => {
  const ownWindows = createOwnWindows({
    windows: createOwnWindowFactory(contextMenus),
    displays,
    apps,
    state: profiles.get,
    isMacOS,
    background,
    backgroundColor: frameColors.ownWindow,
    closeTab: profiles.closeTab,
    saveBounds: profiles.setOwnWindowBounds,
    // Keys go to its find bar while that is open, else its page, as in the
    // main window, so typing after switching back never reaches the page's
    // own shortcuts.
    onFocus: (key) => {
      focus.focusInWindow(key, inOwnWindow(key));
    },
    log,
  });

  frameColors.onChange(ownWindows.recolor);
  profiles.onChange(ownWindows.retitle);
  // Before the windows close, so closing them leaves their tabs where they are.
  lifecycle.onBeforeQuit(ownWindows.markQuitting);
  shell.window.onSessionEnd(ownWindows.markQuitting);
  // Where each window was, saved as they close, and every store's change
  // still being written.
  lifecycle.holdQuitFor(
    () => Promise.allSettled([ownWindows.saved(), storesSettled()]),
    QUIT_WAIT_MS
  );

  /**
   * Brings a tab's own window forward with keys going to its page, as Move
   * to New Window and a click on its tab do. Focusing a page activates the
   * app, so only where it is in front or can never be activated.
   */
  const showOwnWindow = (key: TabKey) => {
    ownWindows.reveal(key);

    if (!background || isTestBackground) {
      focus.focusInWindow(key, inOwnWindow(key));
    }
  };

  /**
   * Brings forward the window that shows the profile's Gmail, a message
   * just opened in it: its own window, or the main one.
   */
  const revealGmail = (profileId: string) => {
    const own = gmailOwnWindow(profiles.get(), profileId);

    if (own) {
      showOwnWindow(own);
    } else {
      revealWindow(shell.window, background);
    }
  };

  /**
   * Opens a tab, bringing it forward as Move to New Window does where Open
   * Google apps in starts it in a window of its own; that window is placed
   * as the change is committed.
   */
  const openTab: Profiles["openTab"] = async (profileId, ...rest) => {
    const opened = await profiles.openTab(profileId, ...rest);

    if (opened?.ownWindow) {
      showOwnWindow({ profileId, tabId: opened.tabId });
    }

    return opened;
  };

  return { ownWindows, showOwnWindow, revealGmail, openTab };
};
