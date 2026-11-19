import type { App } from "#core/apps.ts";
import { windowBackground } from "#core/shell-grey.ts";
import { gmailOwnWindow } from "#core/state.ts";
import type { TabKey } from "#core/tabs.ts";
import type { createAppLifecycle } from "#platform/app.ts";
import type { createContextMenus } from "#platform/context-menu.ts";
import type { createDisplays } from "#platform/displays.ts";
import { createOwnWindowFactory } from "#platform/own-window.ts";
import type { createTheme } from "#platform/theme.ts";

import type { Focus, FocusTarget } from "../focus.ts";
import { createOwnWindows } from "../own-windows.ts";
import type { Profiles } from "../profiles.ts";
import type { createShellWindow } from "../shell-window.ts";
import { revealWindow } from "../windows.ts";

/** The longest a quit waits for the last writes of the state. */
const QUIT_WAIT_MS = 3000;

/**
 * Where keys go in a tab's own window: its Downloads card while open there,
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
  theme,
  shell,
  profiles,
  focus,
}: {
  apps: readonly App[];
  isMacOS: boolean;
  background: boolean;
  isTestBackground: boolean;
  lifecycle: ReturnType<typeof createAppLifecycle>;
  contextMenus: ReturnType<typeof createContextMenus>;
  displays: ReturnType<typeof createDisplays>;
  theme: ReturnType<typeof createTheme>;
  shell: ReturnType<typeof createShellWindow>;
  profiles: Profiles;
  focus: Focus;
}) => {
  const ownWindows = createOwnWindows({
    windows: createOwnWindowFactory(contextMenus),
    displays,
    apps,
    state: profiles.get,
    isMacOS,
    background,
    backgroundColor: () => windowBackground(theme.isDark()),
    closeTab: profiles.closeTab,
    saveBounds: profiles.setOwnWindowBounds,
    // Keys go to its find bar while that is open, else its page, as in the
    // main window, so typing after switching back never reaches the page's
    // own shortcuts.
    onFocus: (key) => {
      focus.focusInWindow(key, inOwnWindow(key));
    },
    log: console.error,
  });

  theme.onChange(ownWindows.recolor);
  profiles.onChange(ownWindows.retitle);
  // Before the windows close, so closing them leaves their tabs where they are.
  lifecycle.onBeforeQuit(ownWindows.markQuitting);
  shell.window.onSessionEnd(ownWindows.markQuitting);
  // Where each window was, saved as they close, and any other change still
  // being written.
  lifecycle.holdQuitFor(
    () => Promise.allSettled([ownWindows.saved(), profiles.settled()]),
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

  return { ownWindows, showOwnWindow, revealGmail };
};
