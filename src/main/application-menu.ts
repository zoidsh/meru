import { t } from "@lingui/core/macro";
import type { MenuItemConstructorOptions } from "electron";
import { isEqual } from "es-toolkit";

import { matchesAccelerator } from "#core/accelerator.ts";
import type { KeyInput } from "#core/accelerator.ts";
import { builtInAccelerator } from "#core/built-in-shortcuts.ts";
import type { BuiltInShortcutId } from "#core/built-in-shortcuts.ts";
import {
  PINNED_SHORTCUT_COUNT,
  selectPinnedCommandId,
} from "#core/pinned-tabs.ts";
import type { Platform } from "#core/platform.ts";
import { selectProfileCommandId } from "#core/profile-shortcuts.ts";
import {
  enabledProfiles,
  isPinned,
  knownTabs,
  selectedProfile,
} from "#core/state.ts";
import { menuText } from "#core/tray.ts";
import type { ZoomChange } from "#platform/zoom.ts";

import {
  isCommandAvailable,
  needsPro,
  savedSearchCommands,
} from "./commands.ts";
import type { Command, CommandActions, CommandContext } from "./commands.ts";
import { doNotDisturbItems } from "./do-not-disturb.ts";
import { proMenuItem } from "./menu-labels.ts";
import { profileDisplayName } from "./profile-copy.ts";

export interface MenuTemplateInput {
  platform: Platform;
  appName: string;
  commands: readonly Command[];
  context: CommandContext;
  /** Runs a command when its item is clicked or its shortcut pressed. */
  run: (command: Command) => void;
  /** The app's language, which times are written in. */
  locale: string;
  /** Actual Size, Zoom In and Zoom Out. */
  zoom: (change: ZoomChange) => void;
  /** Ends the View menu; given by a development build alone. */
  developerTools?: MenuItemConstructorOptions;
}

const separator: MenuItemConstructorOptions = { type: "separator" };

/** The item's accelerator from the built-in table; none where its role gives the key. */
const builtIn = (id: BuiltInShortcutId, platform: Platform) => {
  const accelerator = builtInAccelerator(id, platform);

  return accelerator === undefined ? {} : { accelerator };
};

/** The label of the item a built-in key belongs to, which the Shortcuts page shows too. */
export const builtInLabel = (
  id: BuiltInShortcutId,
  appName: string,
  platform: Platform
) => {
  switch (id) {
    case "resetZoom": {
      return t({
        message: "Actual Size",
        comment:
          "Menu item in the View menu that sets the page's zoom back to 100%",
      });
    }
    case "zoomIn": {
      return t({
        message: "Zoom In",
        comment: "Menu item in the View menu that makes the page larger",
      });
    }
    case "zoomOut": {
      return t({
        message: "Zoom Out",
        comment: "Menu item in the View menu that makes the page smaller",
      });
    }
    case "fullScreen": {
      return t({
        message: "Toggle Full Screen",
        comment:
          "Menu item in the View menu that makes the window fill the screen, or stop filling it",
      });
    }
    case "minimize": {
      return t({
        message: "Minimize",
        comment: "Menu item in the Window menu",
      });
    }
    case "close": {
      return platform === "darwin"
        ? t({
            message: "Close Window",
            comment: "Menu item in the macOS Window menu",
          })
        : t({
            message: "Close",
            comment: "Menu item in the Window menu that closes the window",
          });
    }
    case "quit": {
      return t({
        message: `Quit ${appName}`,
        comment:
          "Menu item that quits the app; {appName} is the app's name, such as Meru",
      });
    }
    default: {
      return "";
    }
  }
};

/**
 * The zoom items' keys as a view hears them; `=`, which carries `+`, zooms
 * in with Shift or without.
 */
const ZOOM_KEYS: readonly (readonly [string, ZoomChange])[] = [
  ["CommandOrControl+0", "reset"],
  ["CommandOrControl+=", "in"],
  ["CommandOrControl+Shift+=", "in"],
  ["CommandOrControl+-", "out"],
];

/** The app menu's items that are the system's own. */
const appRoles = (appName: string, platform: Platform) => {
  const quit: MenuItemConstructorOptions = {
    label: builtInLabel("quit", appName, platform),
    role: "quit",
    ...builtIn("quit", platform),
  };

  return {
    about: {
      label: t({
        message: `About ${appName}`,
        comment:
          "Menu item in the macOS app menu that shows the app's version; {appName} is the app's name",
      }),
      role: "about",
    } satisfies MenuItemConstructorOptions,
    services: {
      label: t({
        message: "Services",
        comment:
          "The macOS app menu's submenu of system services, named as macOS names it",
      }),
      role: "services",
    } satisfies MenuItemConstructorOptions,
    hide: [
      {
        label: t({
          message: `Hide ${appName}`,
          comment:
            "Menu item in the macOS app menu that hides the app; {appName} is the app's name",
        }),
        role: "hide",
      },
      {
        label: t({
          message: "Hide Others",
          comment: "Menu item in the macOS app menu that hides every other app",
        }),
        role: "hideOthers",
      },
      {
        label: t({
          message: "Show All",
          comment:
            "Menu item in the macOS app menu that shows every hidden app again",
        }),
        role: "unhide",
      },
    ] satisfies MenuItemConstructorOptions[],
    quit,
  };
};

const editLabel = () =>
  t({ message: "Edit", comment: "Name of the Edit menu" });

/** The Edit menu's items that are the system's roles, which keep text editing working. */
const editRoles = (): MenuItemConstructorOptions[] => [
  {
    label: t({ message: "Undo", comment: "Menu item in the Edit menu" }),
    role: "undo",
    id: "edit.undo",
  },
  {
    label: t({ message: "Redo", comment: "Menu item in the Edit menu" }),
    role: "redo",
    id: "edit.redo",
  },
  separator,
  {
    label: t({ message: "Cut", comment: "Menu item in the Edit menu" }),
    role: "cut",
    id: "edit.cut",
  },
  {
    label: t({ message: "Copy", comment: "Menu item in the Edit menu" }),
    role: "copy",
    id: "edit.copy",
  },
  {
    label: t({ message: "Paste", comment: "Menu item in the Edit menu" }),
    role: "paste",
    id: "edit.paste",
  },
  {
    label: t({
      message: "Paste and Match Style",
      comment:
        "Menu item in the Edit menu that pastes text without its formatting",
    }),
    role: "pasteAndMatchStyle",
    id: "edit.pasteAndMatchStyle",
  },
  {
    label: t({
      message: "Delete",
      comment: "Menu item in the Edit menu that deletes the selected text",
    }),
    role: "delete",
    id: "edit.delete",
  },
  {
    label: t({
      message: "Select All",
      comment: "Menu item in the Edit menu",
    }),
    role: "selectAll",
    id: "edit.selectAll",
  },
];

const windowLabel = () =>
  t({ message: "Window", comment: "Name of the Window menu" });

/** The Window menu's items for the window itself. */
const windowRoles = (appName: string, platform: Platform) => {
  const isMacOS = platform === "darwin";
  const minimize: MenuItemConstructorOptions = {
    label: builtInLabel("minimize", appName, platform),
    role: "minimize",
    ...builtIn("minimize", platform),
  };

  return {
    minimize,
    zoom: {
      label: t({
        message: "Zoom",
        comment:
          "Menu item in the macOS Window menu that toggles the window between its size and filling the screen",
      }),
      role: "zoom",
    } satisfies MenuItemConstructorOptions,
    // Elsewhere not the role, whose Ctrl+W would close the window, and so
    // quit Meru, from a page where people press it to close a tab or a
    // draft; Alt+F4 still closes it.
    close: (isMacOS
      ? {
          label: builtInLabel("close", appName, platform),
          role: "close",
          id: "window.close",
          ...builtIn("close", platform),
        }
      : {
          label: builtInLabel("close", appName, platform),
          id: "window.close",
          ...builtIn("close", platform),
          click: (_item, window) => {
            window?.close();
          },
        }) satisfies MenuItemConstructorOptions,
    front: {
      label: t({
        message: "Bring All to Front",
        comment: "Menu item in the macOS Window menu",
      }),
      role: "front",
    } satisfies MenuItemConstructorOptions,
  };
};

/**
 * The menu while the launch waits for a choice after the trial: the app's
 * and the window's own items, and editing for the license key's field.
 */
export const buildLaunchMenuTemplate = ({
  platform,
  appName,
}: {
  platform: Platform;
  appName: string;
}): MenuItemConstructorOptions[] => {
  const isMacOS = platform === "darwin";
  const roles = appRoles(appName, platform);
  const windowItems = windowRoles(appName, platform);

  return [
    {
      label: appName,
      submenu: isMacOS
        ? [
            roles.about,
            separator,
            roles.services,
            separator,
            ...roles.hide,
            separator,
            roles.quit,
          ]
        : [roles.quit],
    },
    { label: editLabel(), submenu: editRoles() },
    {
      label: windowLabel(),
      ...(isMacOS ? { role: "windowMenu" as const } : {}),
      submenu: isMacOS
        ? [
            windowItems.minimize,
            windowItems.zoom,
            windowItems.close,
            separator,
            windowItems.front,
          ]
        : [windowItems.minimize, windowItems.close],
    },
  ];
};

/**
 * Meru's application menu: its own items from the registry, which a platform
 * without a command simply leaves out, and the standard roles, which keep
 * undo, copy, paste and select all working inside a page.
 */
export const buildMenuTemplate = ({
  platform,
  appName,
  commands,
  context,
  run,
  locale,
  zoom,
  developerTools,
}: MenuTemplateInput): MenuItemConstructorOptions[] => {
  const isMacOS = platform === "darwin";

  const commandItem = (
    command: Command,
    type?: "checkbox",
    asText = false
  ): MenuItemConstructorOptions => {
    const title = command.label?.(context) ?? command.title();
    const label = asText ? menuText(title, platform) : title;

    return {
      id: command.id,
      ...(needsPro(command, context) ? proMenuItem(label) : { label }),
      ...(command.shortcut?.[platform] && {
        accelerator: command.shortcut[platform],
      }),
      enabled: isCommandAvailable(command, context),
      ...(type && {
        type,
        checked: command.isChecked?.(context) ?? false,
      }),
      click: () => {
        run(command);
      },
    };
  };

  const item = (
    id: string,
    type?: "checkbox"
  ): MenuItemConstructorOptions[] => {
    const command = commands.find((candidate) => candidate.id === id);

    if (!command) {
      return [];
    }

    return [commandItem(command, type)];
  };

  const doNotDisturbLabel = t({
    message: "Do Not Disturb",
    comment:
      "Submenu of the app menu with how long to hold new mail notifications for, or to stop",
  });
  const doNotDisturb: MenuItemConstructorOptions = {
    ...(context.can("notificationGates")
      ? { label: doNotDisturbLabel }
      : { ...proMenuItem(doNotDisturbLabel), enabled: false }),
    submenu: doNotDisturbItems(commands, context, locale, run),
  };

  const roles = appRoles(appName, platform);
  const appMenu: MenuItemConstructorOptions = {
    label: appName,
    submenu: isMacOS
      ? [
          roles.about,
          separator,
          ...item("app.settings"),
          separator,
          doNotDisturb,
          separator,
          roles.services,
          separator,
          ...roles.hide,
          separator,
          roles.quit,
        ]
      : [
          ...item("app.settings"),
          separator,
          doNotDisturb,
          separator,
          roles.quit,
        ],
  };

  const editMenu: MenuItemConstructorOptions = {
    label: editLabel(),
    submenu: [
      ...editRoles(),
      separator,
      ...item("tab.find"),
      ...item("tab.findNext"),
      ...item("tab.findPrevious"),
    ],
  };

  const viewMenu: MenuItemConstructorOptions = {
    label: t({ message: "View", comment: "Name of the View menu" }),
    submenu: [
      ...item("sidebar.toggle", "checkbox"),
      ...item("inbox.toggle", "checkbox"),
      ...item("downloads.toggle", "checkbox"),
      separator,
      ...item("tab.back"),
      ...item("tab.forward"),
      ...item("tab.reload"),
      ...item("tab.stop"),
      separator,
      // Not the zoom roles, which zoom whatever has focus, the find bar's
      // view among them; the roles' own keys.
      {
        label: builtInLabel("resetZoom", appName, platform),
        id: "view.resetZoom",
        ...builtIn("resetZoom", platform),
        click: () => {
          zoom("reset");
        },
      },
      {
        label: builtInLabel("zoomIn", appName, platform),
        id: "view.zoomIn",
        ...builtIn("zoomIn", platform),
        click: () => {
          zoom("in");
        },
      },
      {
        label: builtInLabel("zoomOut", appName, platform),
        id: "view.zoomOut",
        ...builtIn("zoomOut", platform),
        click: () => {
          zoom("out");
        },
      },
      separator,
      {
        label: builtInLabel("fullScreen", appName, platform),
        role: "togglefullscreen",
        ...builtIn("fullScreen", platform),
      },
      ...(developerTools ? [separator, developerTools] : []),
    ],
  };

  const searches = savedSearchCommands(context.state);
  const mailName = t({
    message: "Mail",
    comment:
      "Name of the menu of commands on the selected profile's Gmail: compose, saved searches and Gmail's settings",
  });

  const mailMenu: MenuItemConstructorOptions = {
    label: mailName,
    submenu: [
      ...item("gmail.compose"),
      separator,
      {
        label: t({
          message: "Saved Searches",
          comment:
            "Submenu of the Mail menu listing the selected profile's saved Gmail searches, each of which runs its search",
        }),
        submenu: [
          ...(searches.length > 0
            ? searches.map(({ open }) => commandItem(open, undefined, true))
            : [
                {
                  label: t({
                    message: "No Saved Searches",
                    comment:
                      "Item of the Saved Searches menu, not clickable, while the selected profile has none",
                  }),
                  enabled: false,
                },
              ]),
          separator,
          ...item("savedSearch.save"),
          {
            label: t({
              message: "Remove Saved Search",
              comment:
                "Submenu of the Saved Searches menu listing each saved search, to remove the one chosen",
            }),
            enabled: searches.length > 0,
            submenu: searches.map(({ remove }) =>
              commandItem(remove, undefined, true)
            ),
          },
        ],
      },
      separator,
      ...item("gmail.settings"),
    ],
  };

  // Each pinned tab with a shortcut, by its app's name, as the profiles are;
  // a list of tabs, so none while the run has one tab alone.
  const pinnedCount = context.can("workspaceApps")
    ? Math.min(
        knownTabs(selectedProfile(context.state)).filter(isPinned).length,
        PINNED_SHORTCUT_COUNT
      )
    : 0;
  const pinnedItems = Array.from({ length: pinnedCount }, (_, index) =>
    item(selectPinnedCommandId(index + 1))
  ).flat();

  const tabsMenu: MenuItemConstructorOptions = {
    label: t({
      message: "Tabs",
      comment: "Name of the menu of commands on the selected profile's tabs",
    }),
    submenu: [
      ...item("app.open"),
      separator,
      ...item("tab.bookmark"),
      separator,
      ...item("tab.next"),
      ...item("tab.previous"),
      separator,
      ...(pinnedItems.length > 0 ? [...pinnedItems, separator] : []),
      ...item("tab.sleep"),
      separator,
      ...item("tab.splitRight"),
      ...item("tab.splitDown"),
      ...item("tab.maximize"),
      ...item("tab.separate"),
      separator,
      ...item("tab.moveToNewWindow"),
      ...item("tab.moveToMainWindow"),
      separator,
      ...item("tab.pin"),
      ...item("tab.openAtLaunch", "checkbox"),
      separator,
      ...item("tab.close"),
    ],
  };

  // Each profile with a shortcut, by the name the title bar shows.
  const profileSelectItems = enabledProfiles(context.state).flatMap(
    (profile, index) =>
      item(selectProfileCommandId(index + 1)).map((each) => ({
        ...each,
        label: profileDisplayName(profile),
      }))
  );

  const profileItems = [
    ...profileSelectItems,
    separator,
    ...item("profile.next"),
    ...item("profile.previous"),
    separator,
    ...item("profile.sleep"),
  ];

  const windowItems = windowRoles(appName, platform);
  const windowMenu: MenuItemConstructorOptions = {
    label: windowLabel(),
    ...(isMacOS ? { role: "windowMenu" as const } : {}),
    submenu: isMacOS
      ? [
          windowItems.minimize,
          windowItems.zoom,
          windowItems.close,
          separator,
          ...profileItems,
          separator,
          windowItems.front,
        ]
      : [windowItems.minimize, windowItems.close, separator, ...profileItems],
  };

  // On macOS the role gives the menu its search field; elsewhere a Help
  // menu would be empty.
  const helpMenu: MenuItemConstructorOptions[] = isMacOS
    ? [
        {
          label: t({ message: "Help", comment: "Name of the Help menu" }),
          role: "help",
          submenu: [],
        },
      ]
    : [];

  return [
    appMenu,
    editMenu,
    viewMenu,
    mailMenu,
    tabsMenu,
    windowMenu,
    ...helpMenu,
  ];
};

export interface ApplicationMenuDeps {
  platform: Platform;
  zoom: (change: ZoomChange) => void;
  developerTools?: MenuItemConstructorOptions;
  appName: string;
  commands: readonly Command[];
  context: () => CommandContext;
  actions: CommandActions;
  locale: () => string;
  setMenu: (template: MenuItemConstructorOptions[]) => void;
  log: (message: string) => void;
}

const describe = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/**
 * Sets the application menu and sets it again whenever what a command
 * offers, whether it is available or checked, has changed since.
 */
export const createApplicationMenu = ({
  platform,
  zoom,
  developerTools,
  appName,
  commands,
  context,
  actions,
  locale,
  setMenu,
  log,
}: ApplicationMenuDeps) => {
  let shown: unknown;

  // With Do Not Disturb's end, which its menu says, and the saved searches
  // it lists.
  const offered = (current: CommandContext) => [
    locale(),
    current.doNotDisturb?.until,
    enabledProfiles(current.state).map((profile) => profile.name),
    savedSearchCommands(current.state).map(({ open }) => [
      open.id,
      open.title(),
    ]),
    ...commands.map((command) => [
      command.id,
      command.label?.(current),
      isCommandAvailable(command, current),
      command.isChecked?.(current),
    ]),
  ];

  /**
   * A command fails into the log. A choice's menu is set again after it
   * either way, since Electron checks a clicked checkbox item itself.
   */
  const run = async (command: Command) => {
    try {
      await command.run(context(), actions);
    } catch (error) {
      log(`Command ${command.id} failed: ${describe(error)}`);
    }

    // oxlint-disable-next-line no-use-before-define -- run and build call each other
    build(command.isChecked !== undefined);
  };

  const build = (force: boolean) => {
    const current = context();
    const next = offered(current);

    if (!force && isEqual(next, shown)) {
      return;
    }

    shown = next;
    setMenu(
      buildMenuTemplate({
        platform,
        appName,
        commands,
        context: current,
        run: (command) => {
          run(command);
        },
        locale: locale(),
        zoom,
        ...(developerTools && { developerTools }),
      })
    );
  };

  build(true);

  return {
    /**
     * Runs the command with `id`, as its menu item would; one the run's
     * Meru Pro refuses is refused into the log, as its item is disabled.
     */
    runCommand: (id: string) => {
      const command = commands.find((candidate) => candidate.id === id);

      if (command && needsPro(command, context())) {
        log(`Refused command ${id}, which needs Meru Pro`);
      } else if (command) {
        void run(command);
      }
    },
    /** The Do Not Disturb menu as the application menu has it now. */
    doNotDisturbItems: () =>
      doNotDisturbItems(commands, context(), locale(), (command) => {
        void run(command);
      }),
    /** Sets the menu again if what it offers has changed. */
    refresh: () => {
      build(false);
    },
    /**
     * Runs the available command whose shortcut a key in a page is, or
     * zooms, since the menu hears only what reaches it, which focus inside a
     * page's view does not promise. Says whether it was one; a held key
     * repeating a command that runs once is one, run no further.
     */
    handleKey: (input: KeyInput) => {
      const current = context();
      const command = commands.find((candidate) => {
        const shortcut = candidate.shortcut?.[platform];

        return (
          shortcut !== undefined &&
          matchesAccelerator(shortcut, input, platform === "darwin") &&
          isCommandAvailable(candidate, current)
        );
      });

      if (command && !(input.isAutoRepeat && command.once)) {
        run(command);
      }

      const zoomed =
        command === undefined
          ? ZOOM_KEYS.find(([accelerator]) =>
              matchesAccelerator(accelerator, input, platform === "darwin")
            )
          : undefined;

      if (zoomed) {
        zoom(zoomed[1]);
      }

      return command !== undefined || zoomed !== undefined;
    },
  };
};
