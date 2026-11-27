import { t } from "@lingui/core/macro";
import { noop } from "es-toolkit";

import type { SettingsState } from "#contract/settings.ts";
import { acceleratorKeys, acceleratorParts } from "#core/accelerator.ts";
import { BUILT_IN_SHORTCUTS } from "#core/built-in-shortcuts.ts";
import type { Platform } from "#core/platform.ts";
import { SHORTCUT_FAMILIES, shortcutCards } from "#core/shortcut-cards.ts";
import type { ShortcutFamily, ShortcutRow } from "#core/shortcut-cards.ts";
import { newProfile } from "#core/state.ts";

import { builtInLabel, buildMenuTemplate } from "./application-menu.ts";
import { NO_PAGE } from "./commands.ts";
import type { Command, CommandContext } from "./commands.ts";

type Shortcuts = SettingsState["shortcuts"];
type Keys = Shortcuts["cards"][number]["rows"][number]["keys"];

/**
 * A run with every menu item a command can have: one profile, whose Gmail
 * tab is pinned, and all of Meru Pro, so each family has an item to place
 * it by and nothing is left out for the run's license.
 */
const LISTING: CommandContext = {
  state: {
    version: 1,
    profiles: [newProfile("listing", "")],
    selectedProfileId: "listing",
  },
  ownWindow: undefined,
  settingsFocused: false,
  settingsHistory: undefined,
  doNotDisturb: undefined,
  can: () => true,
  canUpdate: true,
  inboxOpen: false,
  downloadsOpen: false,
  openAppOpen: false,
  sidebarShown: false,
  ...NO_PAGE,
};

/** A key's name as a screen reader says it, where its symbol would be read badly. */
const spokenKey = (key: string, platform: Platform): string | undefined => {
  switch (key.toLowerCase()) {
    case "tab": {
      return t({
        message: "Tab",
        comment:
          "The Tab key, as a screen reader says it in a keyboard shortcut",
      });
    }
    case "enter":
    case "return": {
      return platform === "darwin"
        ? t({
            message: "Return",
            comment:
              "The Return key on a Mac, as a screen reader says it in a keyboard shortcut",
          })
        : t({
            message: "Enter",
            comment:
              "The Enter key, as a screen reader says it in a keyboard shortcut",
          });
    }
    case "left": {
      return t({
        message: "Left Arrow",
        comment:
          "The left arrow key, as a screen reader says it in a keyboard shortcut",
      });
    }
    case "right": {
      return t({
        message: "Right Arrow",
        comment:
          "The right arrow key, as a screen reader says it in a keyboard shortcut",
      });
    }
    case "down": {
      return t({
        message: "Down Arrow",
        comment:
          "The down arrow key, as a screen reader says it in a keyboard shortcut",
      });
    }
    case "plus": {
      return t({
        message: "Plus",
        comment: "The + key, as a screen reader says it in a keyboard shortcut",
      });
    }
    case "-": {
      return t({
        message: "Minus",
        comment: "The - key, as a screen reader says it in a keyboard shortcut",
      });
    }
    case ",": {
      return t({
        message: "Comma",
        comment: "The , key, as a screen reader says it in a keyboard shortcut",
      });
    }
    case "[": {
      return t({
        message: "Left Bracket",
        comment: "The [ key, as a screen reader says it in a keyboard shortcut",
      });
    }
    case "]": {
      return t({
        message: "Right Bracket",
        comment: "The ] key, as a screen reader says it in a keyboard shortcut",
      });
    }
    default: {
      return undefined;
    }
  }
};

const spokenModifier = (
  modifier: "control" | "alt" | "shift" | "meta",
  platform: Platform
): string | undefined => {
  switch (modifier) {
    case "control": {
      return t({
        message: "Control",
        comment:
          "The Control key, as a screen reader says it in a keyboard shortcut",
      });
    }
    case "alt": {
      return platform === "darwin"
        ? t({
            message: "Option",
            comment:
              "The Option key on a Mac, as a screen reader says it in a keyboard shortcut",
          })
        : t({
            message: "Alt",
            comment:
              "The Alt key, as a screen reader says it in a keyboard shortcut",
          });
    }
    case "shift": {
      return t({
        message: "Shift",
        comment:
          "The Shift key, as a screen reader says it in a keyboard shortcut",
      });
    }
    case "meta": {
      // No shortcut holds Super off macOS, where its part is shown as is.
      return platform === "darwin"
        ? t({
            message: "Command",
            comment:
              "The Command key on a Mac, as a screen reader says it in a keyboard shortcut",
          })
        : undefined;
    }
    default: {
      return undefined;
    }
  }
};

/** An accelerator's keys as shown, one part each, and as a screen reader says them. */
export const shortcutKeys = (
  accelerator: string | undefined,
  platform: Platform
): Keys => {
  if (accelerator === undefined) {
    return null;
  }

  const parts = acceleratorParts(accelerator, platform);
  const spoken = acceleratorKeys(accelerator, platform).map(
    (key, index) =>
      (key.modifier === undefined
        ? spokenKey(key.key, platform)
        : spokenModifier(key.modifier, platform)) ?? parts[index]
  );

  return { parts, spoken: spoken.join(" ") };
};

const familyTitle = (family: ShortcutFamily) => {
  const first = 1;
  const last = SHORTCUT_FAMILIES[family].count;

  return family === "pinned"
    ? t({
        message: `Select Pinned Tab ${first} to ${last}`,
        comment:
          "Row of the Shortcuts page in Settings standing for the commands that select the pinned tab at each place, from {first} to {last}",
      })
    : t({
        message: `Select Profile ${first} to ${last}`,
        comment:
          "Row of the Shortcuts page in Settings standing for the commands that select the profile at each place, from {first} to {last}",
      });
};

/**
 * The Shortcuts page's cards, read from the application menu as `platform`
 * builds it, and the built-in keys from the table the menu takes them from.
 */
export const readShortcuts = (
  platform: Platform,
  appName: string,
  commands: readonly Command[]
): Shortcuts => {
  const byId = new Map(commands.map((command) => [command.id, command]));
  const keysOf = (id: string) =>
    shortcutKeys(byId.get(id)?.shortcut?.[platform], platform);
  const menus = buildMenuTemplate({
    platform,
    appName,
    commands,
    context: LISTING,
    run: noop,
    locale: "en",
    zoom: noop,
  });
  const row = (entry: ShortcutRow) =>
    entry.family === undefined
      ? {
          title: byId.get(entry.id)?.title() ?? "",
          keys: keysOf(entry.id),
          to: null,
        }
      : {
          title: familyTitle(entry.family),
          keys: keysOf(entry.first),
          to: keysOf(entry.last),
        };

  return {
    cards: shortcutCards(menus, new Set(byId.keys())).map((card) => ({
      title: card.menu,
      rows: card.rows.map(row),
    })),
    builtIn: BUILT_IN_SHORTCUTS.flatMap(({ id, shortcut }) => {
      const keys = shortcutKeys(shortcut[platform], platform);

      return keys ? [{ title: builtInLabel(id, appName, platform), keys }] : [];
    }),
  };
};
