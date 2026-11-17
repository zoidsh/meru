import { t } from "@lingui/core/macro";
import { isEqual } from "es-toolkit";

import type { Platform } from "#core/platform.ts";
import type { SettingKey, SettingValue } from "#core/settings.ts";
import type { State } from "#core/state.ts";
import {
  menuText,
  trayClick,
  trayEntries,
  trayImageName,
  trayMenuOpensOnClick,
} from "#core/tray.ts";
import type { TrayEntry, TrayProfile } from "#core/tray.ts";
import { totalUnread } from "#core/unread.ts";
import type { TrayFactory, TrayIcon, TrayMenuItem } from "#platform/tray.ts";
import type { AppWindow } from "#platform/window.ts";

import { unreadText } from "./badge.ts";
import { profileDisplayName } from "./profile-copy.ts";

export interface TrayDeps {
  trays: TrayFactory;
  platform: Platform;
  productName: string;
  /** Read at each update, so a change applies with no restart. */
  setting: <Key extends SettingKey>(key: Key) => SettingValue<Key>;
  isDark: () => boolean;
  state: () => State;
  /** The profile's count as its feed last gave it. */
  unread: (profileId: string) => number | null;
  window: Pick<AppWindow, "isVisible" | "hide">;
  /** Shows the window, through `revealWindow`. */
  reveal: () => void;
  /** Selects the profile and its Gmail tab. */
  jumpTo: (profileId: string) => Promise<void>;
  quit: () => void;
  log: (message: string) => void;
}

const quitLabel = (platform: Platform, productName: string) => {
  switch (platform) {
    case "darwin": {
      return t({
        message: `Quit ${productName}`,
        context: "macOS",
        comment:
          "Menu bar icon's menu item that quits Meru; {productName} is Meru",
      });
    }
    case "win32": {
      return t({
        message: "Exit",
        context: "Windows",
        comment: "Tray menu item that quits Meru",
      });
    }
    default: {
      return t({
        message: "Quit",
        context: "Linux",
        comment: "Tray menu item that quits Meru",
      });
    }
  }
};

/**
 * The tray or menu bar icon: unread mail in its image or beside it, a menu to
 * jump to a profile, and a click that shows or hides the window.
 */
export const createTray = ({
  trays,
  platform,
  productName,
  setting,
  isDark,
  state,
  unread,
  window,
  reveal,
  jumpTo,
  quit,
  log,
}: TrayDeps) => {
  let tray: TrayIcon | undefined;
  let shown: { image: string; title: string; menu?: TrayEntry[] } | undefined;

  const profiles = (): TrayProfile[] =>
    state().profiles.map((profile) => ({
      id: profile.id,
      name: profileDisplayName(profile),
      unreadCount: unread(profile.id),
    }));

  const open = async (profileId?: string) => {
    if (profileId) {
      try {
        await jumpTo(profileId);
      } catch (error) {
        log(`The tray's profile was not selected: ${String(error)}`);
      }
    }

    reveal();
  };

  const label = (entry: TrayEntry & { kind: "profile" }) => {
    const name = menuText(entry.name, platform);

    if (entry.unreadCount === 0) {
      return name;
    }

    const count = unreadText(entry.unreadCount);

    return t({
      message: `${name} (${count})`,
      comment:
        "A profile in the tray's menu with its unread count; {name} is the profile's name and {count} the number of unread messages",
    });
  };

  const menu = (entries: readonly TrayEntry[]): TrayMenuItem[] =>
    entries.map((entry): TrayMenuItem => {
      switch (entry.kind) {
        case "profile": {
          return {
            kind: "item",
            label: label(entry),
            click: () => {
              void open(entry.profileId);
            },
          };
        }
        case "toggle": {
          return entry.hides
            ? {
                kind: "item",
                label: t({
                  message: `Hide ${productName}`,
                  comment:
                    "Tray menu item that hides Meru's window; {productName} is Meru",
                }),
                click: window.hide,
              }
            : {
                kind: "item",
                label: t({
                  message: `Show ${productName}`,
                  comment:
                    "Tray menu item that brings Meru's window back; {productName} is Meru",
                }),
                click: reveal,
              };
        }
        case "quit": {
          return {
            kind: "item",
            label: quitLabel(platform, productName),
            click: quit,
          };
        }
        default: {
          return { kind: "separator" };
        }
      }
    });

  const entriesNow = () =>
    trayEntries({ profiles: profiles(), windowVisible: window.isVisible() });

  const click = () => {
    const action = trayClick({
      windowVisible: window.isVisible(),
      jumpsToUnread: setting("trayJumpsToUnread"),
      profiles: profiles(),
    });

    if (action.kind === "hide") {
      window.hide();
    } else {
      void open(action.profileId);
    }
  };

  const create = (image: string) => {
    const created = trays.create(image);

    created.setToolTip(productName);
    created.onClick(click);

    if (!trayMenuOpensOnClick(platform)) {
      // Built as it opens, so it holds the counts and labels of the moment.
      created.onRightClick(() => {
        created.popUpMenu(menu(entriesNow()));
      });
    }

    shown = { image, title: "" };

    return created;
  };

  const destroy = () => {
    tray?.destroy();
    tray = undefined;
    shown = undefined;
  };

  return {
    /** Whether the icon is there, which closing the window depends on. */
    isShown: () => tray !== undefined,
    /** Called whenever the counts, profiles, window, theme or settings change. */
    update: () => {
      if (!setting("tray")) {
        destroy();

        return;
      }

      const listed = profiles();
      const total = totalUnread(listed.map((profile) => profile.unreadCount));
      const image = trayImageName({
        platform,
        hasUnread: total > 0,
        color: setting("trayIconColor"),
        isDark: isDark(),
      });
      const title =
        platform === "darwin" && setting("trayUnreadCount") && total > 0
          ? String(total)
          : "";

      tray ??= create(image);

      if (shown?.image !== image) {
        tray.setImage(image);
      }

      if (shown?.title !== title) {
        tray.setTitle(title);
      }

      const entries = trayMenuOpensOnClick(platform)
        ? trayEntries({ profiles: listed, windowVisible: window.isVisible() })
        : undefined;

      if (entries && !isEqual(entries, shown?.menu)) {
        tray.setContextMenu(menu(entries));
      }

      shown = { image, title, ...(entries && { menu: entries }) };
    },
    destroy,
  };
};

export type AppTray = ReturnType<typeof createTray>;
