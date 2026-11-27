import { t } from "@lingui/core/macro";
import { noop } from "es-toolkit";

import type { SettingsState } from "#contract/settings.ts";
import {
  acceleratorKeys,
  acceleratorParts,
  formatAccelerator,
} from "#core/accelerator.ts";
import { BUILT_IN_SHORTCUTS } from "#core/built-in-shortcuts.ts";
import { googleAppsUsing } from "#core/google-app-keys.ts";
import type { Platform } from "#core/platform.ts";
import { SHORTCUT_FAMILIES, shortcutCards } from "#core/shortcut-cards.ts";
import type { ShortcutFamily, ShortcutRow } from "#core/shortcut-cards.ts";
import { newProfile } from "#core/state.ts";

import { builtInLabel, buildMenuTemplate } from "./application-menu.ts";
import { NO_PAGE } from "./commands.ts";
import type { Command, CommandContext } from "./commands.ts";
import type { KeymapService } from "./keymap.ts";

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
 * The quiet line under a key a person gave a command that Google's apps
 * use too, naming two of them at most; none when no app does.
 */
export const googleNote = (apps: readonly string[]): string | null => {
  const [first, second] = apps;

  if (first === undefined) {
    return null;
  }

  if (second === undefined) {
    return t({
      message: `${first} also uses this key. Meru's shortcut will win.`,
      comment:
        "Note under a shortcut a person set on the Shortcuts page of Settings, when a Google app uses the same key; {first} is the app's name, such as Docs",
    });
  }

  return apps.length === 2
    ? t({
        message: `${first} and ${second} also use this key. Meru's shortcut will win.`,
        comment:
          "Note under a shortcut a person set on the Shortcuts page of Settings, when two Google apps use the same key; {first} and {second} are the apps' names, such as Docs and Sheets",
      })
    : t({
        message: `${first}, ${second} and others also use this key. Meru's shortcut will win.`,
        comment:
          "Note under a shortcut a person set on the Shortcuts page of Settings, when three or more Google apps use the same key; {first} and {second} are two of the apps' names, such as Docs and Sheets",
      });
};

/** What the page may change, and what is changed, from the keymap and the recorder. */
export interface ShortcutsEditing {
  changeable: (id: string) => boolean;
  /** Whether the command's key is the person's own, applied in this run. */
  changed: (id: string) => boolean;
  defaultKey: (id: string) => string | undefined;
  recording: string | null;
}

const UNCHANGED = { changed: false, note: null, google: null };

const NOT_EDITING: ShortcutsEditing = {
  changeable: () => false,
  changed: () => false,
  // oxlint-disable-next-line unicorn/no-useless-undefined -- no default is shown
  defaultKey: () => undefined,
  recording: null,
};

/** What the page may change now: every command's key the keymap allows, with Meru Pro. */
export const shortcutsEditing = (
  keymap: Pick<KeymapService, "current" | "defaults" | "isChangeable">,
  recording: string | null,
  pro: boolean
): ShortcutsEditing => {
  const { changed } = keymap.current();

  return {
    changeable: (id) => pro && keymap.isChangeable(id),
    changed: (id) => changed.has(id),
    defaultKey: keymap.defaults,
    recording,
  };
};

const defaultSentence = (
  accelerator: string | undefined,
  platform: Platform
) => {
  if (accelerator === undefined) {
    return t({
      message: "There's no default.",
      comment:
        "Under a command on the Shortcuts page of Settings whose key a person set, when the command has no key of its own on this platform",
    });
  }

  const keys = formatAccelerator(accelerator, platform);

  return t({
    message: `The default is ${keys}.`,
    comment:
      "Under a command on the Shortcuts page of Settings whose key a person set; {keys} is the command's own key, such as ⌃⇧R",
  });
};

/**
 * The Shortcuts page's cards, read from the application menu as `platform`
 * builds it, and the built-in keys from the table the menu takes them from.
 */
export const readShortcuts = (
  platform: Platform,
  appName: string,
  commands: readonly Command[],
  editing: ShortcutsEditing = NOT_EDITING
): Shortcuts => {
  const byId = new Map(commands.map((command) => [command.id, command]));
  const keyOf = (id: string) => byId.get(id)?.shortcut?.[platform];
  const keysOf = (id: string) => shortcutKeys(keyOf(id), platform);
  const changedRow = (id: string) => {
    const key = keyOf(id);

    return {
      changed: true,
      note: defaultSentence(editing.defaultKey(id), platform),
      google:
        key === undefined ? null : googleNote(googleAppsUsing(key, platform)),
    };
  };
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
          id: editing.changeable(entry.id) ? entry.id : null,
          title: byId.get(entry.id)?.title() ?? "",
          keys: keysOf(entry.id),
          to: null,
          ...(editing.changed(entry.id) ? changedRow(entry.id) : UNCHANGED),
        }
      : {
          id: null,
          title: familyTitle(entry.family),
          keys: keysOf(entry.first),
          to: keysOf(entry.last),
          ...UNCHANGED,
        };

  return {
    recording: editing.recording,
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
