import { t } from "@lingui/core/macro";
import type { MenuItemConstructorOptions } from "electron";
import { isEqual } from "es-toolkit";

import { matchesAccelerator } from "#core/accelerator.ts";
import type { KeyInput } from "#core/accelerator.ts";
import type { Platform } from "#core/platform.ts";
import { menuText } from "#core/tray.ts";

import { savedSearchCommands } from "./commands.ts";
import type { Command, CommandActions, CommandContext } from "./commands.ts";
import { doNotDisturbItems } from "./do-not-disturb.ts";

export interface MenuTemplateInput {
  platform: Platform;
  appName: string;
  commands: readonly Command[];
  context: CommandContext;
  /** Runs a command when its item is clicked or its shortcut pressed. */
  run: (command: Command) => void;
  /** The app's language, which times are written in. */
  locale: string;
  /** Ends the View menu; given by a development build alone. */
  developerTools?: MenuItemConstructorOptions;
}

const separator: MenuItemConstructorOptions = { type: "separator" };

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
  developerTools,
}: MenuTemplateInput): MenuItemConstructorOptions[] => {
  const isMacOS = platform === "darwin";

  const commandItem = (
    command: Command,
    type?: "checkbox",
    asText = false
  ): MenuItemConstructorOptions => {
    const title = command.title();

    return {
      id: command.id,
      label: asText ? menuText(title, platform) : title,
      ...(command.shortcut?.[platform] && {
        accelerator: command.shortcut[platform],
      }),
      enabled: command.isAvailable?.(context) ?? true,
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

  const quit: MenuItemConstructorOptions = {
    label: t({
      message: `Quit ${appName}`,
      comment:
        "Menu item that quits the app; {appName} is the app's name, such as Meru",
    }),
    role: "quit",
    // The role has no key on Windows; v3 gives Quit this one everywhere.
    ...(!isMacOS && { accelerator: "CommandOrControl+Q" }),
  };

  const doNotDisturb: MenuItemConstructorOptions = {
    label: t({
      message: "Do Not Disturb",
      comment:
        "Submenu of the app menu with how long to hold new mail notifications for, or to stop",
    }),
    submenu: doNotDisturbItems(commands, context, locale, run),
  };

  const appMenu: MenuItemConstructorOptions = {
    label: appName,
    submenu: isMacOS
      ? [
          {
            label: t({
              message: `About ${appName}`,
              comment:
                "Menu item in the macOS app menu that shows the app's version; {appName} is the app's name",
            }),
            role: "about",
          },
          separator,
          doNotDisturb,
          separator,
          {
            label: t({
              message: "Services",
              comment:
                "The macOS app menu's submenu of system services, named as macOS names it",
            }),
            role: "services",
          },
          separator,
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
              comment:
                "Menu item in the macOS app menu that hides every other app",
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
          separator,
          quit,
        ]
      : [doNotDisturb, separator, quit],
  };

  const editMenu: MenuItemConstructorOptions = {
    label: t({ message: "Edit", comment: "Name of the Edit menu" }),
    submenu: [
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
    ],
  };

  const viewMenu: MenuItemConstructorOptions = {
    label: t({ message: "View", comment: "Name of the View menu" }),
    submenu: [
      ...item("sidebar.toggle", "checkbox"),
      ...item("inbox.toggle", "checkbox"),
      separator,
      ...item("tab.reload"),
      separator,
      // Each acts on the web contents with focus: a tab's page, or the shell.
      {
        label: t({
          message: "Actual Size",
          comment:
            "Menu item in the View menu that sets the page's zoom back to 100%",
        }),
        role: "resetZoom",
        id: "view.resetZoom",
      },
      {
        label: t({
          message: "Zoom In",
          comment: "Menu item in the View menu that makes the page larger",
        }),
        role: "zoomIn",
        id: "view.zoomIn",
      },
      {
        label: t({
          message: "Zoom Out",
          comment: "Menu item in the View menu that makes the page smaller",
        }),
        role: "zoomOut",
        id: "view.zoomOut",
      },
      separator,
      {
        label: t({
          message: "Toggle Full Screen",
          comment:
            "Menu item in the View menu that makes the window fill the screen, or stop filling it",
        }),
        role: "togglefullscreen",
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

  const tabsMenu: MenuItemConstructorOptions = {
    label: t({
      message: "Tabs",
      comment: "Name of the menu of commands on the selected profile's tabs",
    }),
    submenu: [
      ...item("tab.next"),
      ...item("tab.previous"),
      separator,
      ...item("tab.close"),
    ],
  };

  const minimize: MenuItemConstructorOptions = {
    label: t({
      message: "Minimize",
      comment: "Menu item in the Window menu",
    }),
    role: "minimize",
  };

  const profileItems = [
    ...item("profile.next"),
    ...item("profile.previous"),
    separator,
    ...item("profile.add"),
    ...item("profile.rename"),
  ];

  const windowMenu: MenuItemConstructorOptions = {
    label: t({ message: "Window", comment: "Name of the Window menu" }),
    ...(isMacOS ? { role: "windowMenu" as const } : {}),
    submenu: isMacOS
      ? [
          minimize,
          {
            label: t({
              message: "Zoom",
              comment:
                "Menu item in the macOS Window menu that toggles the window between its size and filling the screen",
            }),
            role: "zoom",
          },
          {
            label: t({
              message: "Close Window",
              comment: "Menu item in the macOS Window menu",
            }),
            role: "close",
            id: "window.close",
          },
          separator,
          ...profileItems,
          separator,
          {
            label: t({
              message: "Bring All to Front",
              comment: "Menu item in the macOS Window menu",
            }),
            role: "front",
          },
        ]
      : [
          minimize,
          // Not the role, whose Ctrl+W would close the window, and so quit
          // Meru, from a page where people press it to close a tab or a
          // draft; Alt+F4 still closes it.
          {
            label: t({
              message: "Close",
              comment: "Menu item in the Window menu that closes the window",
            }),
            id: "window.close",
            click: (_item, window) => {
              window?.close();
            },
          },
          separator,
          ...profileItems,
        ],
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
    current.doNotDisturb?.until,
    savedSearchCommands(current.state).map(({ open }) => [
      open.id,
      open.title(),
    ]),
    ...commands.map((command) => [
      command.id,
      command.isAvailable?.(current) ?? true,
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
        ...(developerTools && { developerTools }),
      })
    );
  };

  build(true);

  return {
    /** Runs the command with `id`, as its menu item would. */
    runCommand: (id: string) => {
      const command = commands.find((candidate) => candidate.id === id);

      if (command) {
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
     * Runs the available command whose shortcut a key in a page is, since
     * the menu hears only what reaches it, which focus inside a page's view
     * does not promise. Says whether it was one; a held key repeating a
     * command that runs once is one, run no further.
     */
    handleKey: (input: KeyInput) => {
      const current = context();
      const command = commands.find((candidate) => {
        const shortcut = candidate.shortcut?.[platform];

        return (
          shortcut !== undefined &&
          matchesAccelerator(shortcut, input, platform === "darwin") &&
          (candidate.isAvailable?.(current) ?? true)
        );
      });

      if (command && !(input.isAutoRepeat && command.once)) {
        run(command);
      }

      return command !== undefined;
    },
  };
};
