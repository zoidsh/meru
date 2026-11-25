import type { Platform } from "#core/platform.ts";
import type { createAppLifecycle } from "#platform/app.ts";
import type { createTheme } from "#platform/theme.ts";

import { createUnreadBadge } from "../badge.ts";
import type { createDoNotDisturb } from "../do-not-disturb.ts";
import { createDockIcon } from "../dock.ts";
import type { Language } from "../language.ts";
import type { MailPoller } from "../mail.ts";
import type { Profiles } from "../profiles.ts";
import type { SettingsStore } from "../settings.ts";
import { hideOnClose } from "../shell-window.ts";
import type { createShellWindow } from "../shell-window.ts";
import type { createShowGmail } from "../show-gmail.ts";
import { createTray } from "../tray.ts";
import { revealWindow } from "../windows.ts";
import { systemBadge, systemDock, systemTrays } from "./test-build.ts";

/**
 * The tray, the Dock icon on macOS, and the Dock's or taskbar's unread badge,
 * the tray and badge following the count, and what brings the window back or
 * quits.
 */
export const wireTray = ({
  platform,
  language,
  isMacOS,
  background,
  lifecycle,
  settings,
  theme,
  profiles,
  mail,
  shell,
  showGmail,
  revealGmail,
  doNotDisturb,
}: {
  platform: Platform;
  /** The tray's menu is labelled again in each language chosen. */
  language: Pick<Language, "onChange">;
  isMacOS: boolean;
  background: boolean;
  lifecycle: ReturnType<typeof createAppLifecycle>;
  settings: SettingsStore;
  theme: ReturnType<typeof createTheme>;
  profiles: Profiles;
  mail: MailPoller;
  shell: ReturnType<typeof createShellWindow>;
  showGmail: ReturnType<typeof createShowGmail>;
  revealGmail: (profileId: string) => void;
  doNotDisturb: ReturnType<typeof createDoNotDisturb>;
}) => {
  const reveal = () => {
    revealWindow(shell.window, background);
  };
  const unread = (profileId: string) => mail.mail(profileId).unreadCount;
  const tray = createTray({
    trays: systemTrays(),
    platform,
    productName: lifecycle.name,
    setting: settings.get,
    isDark: theme.systemIsDark,
    state: profiles.get,
    unread,
    window: shell.window,
    reveal: (profileId) => {
      if (profileId === undefined) {
        reveal();
      } else {
        revealGmail(profileId);
      }
    },
    jumpTo: showGmail.jumpTo,
    quit: lifecycle.quit,
    log: console.error,
  });
  const badge = createUnreadBadge({
    badge: systemBadge(shell.window),
    platform,
    profiles: () => profiles.get().profiles.map((profile) => profile.id),
    unread,
    counted: (profileId) => settings.get("unreadBadge", profileId),
  });
  if (isMacOS) {
    createDockIcon({
      dock: systemDock(),
      settings,
      onShown: badge.redraw,
      log: console.error,
    });
  }

  const showUnread = () => {
    tray.update();
    badge.update();
  };

  mail.onChange(showUnread);
  profiles.onChange(showUnread);
  settings.onChange("unreadBadge", badge.update);
  settings.onChange("trayIconColor", tray.update);
  settings.onChange("trayUnreadCount", tray.update);
  settings.onChange("tray", () => {
    tray.update();

    // Off, the tray can no longer bring a hidden window back on Windows and
    // Linux.
    if (!tray.isShown() && !isMacOS && !shell.window.isVisible()) {
      reveal();
    }
  });
  theme.onChange(tray.update);
  language.onChange(tray.update);
  // The menu's Show or Hide follows the window.
  shell.window.on("show", tray.update);
  shell.window.on("hide", tray.update);
  shell.window.on("minimize", tray.update);
  shell.window.on("restore", tray.update);
  showUnread();

  const closing = hideOnClose({
    window: shell.window,
    platform,
    trayShown: tray.isShown,
    quit: lifecycle.quit,
  });

  lifecycle.onBeforeQuit(() => {
    closing.markQuitting();
    doNotDisturb.dispose();
    badge.close();
    tray.close();
  });

  lifecycle.onActivate(reveal);
  lifecycle.onSecondInstance(reveal);

  lifecycle.onWindowAllClosed(() => {
    lifecycle.quit();
  });
};
