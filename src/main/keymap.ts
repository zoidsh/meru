import { t } from "@lingui/core/macro";

import { formatAccelerator } from "#core/accelerator.ts";
import type { PressedKey } from "#core/accelerator.ts";
import {
  BUILT_IN_SHORTCUTS,
  ROLE_SHORTCUTS,
  ZOOM_IN_KEYS,
} from "#core/built-in-shortcuts.ts";
import type {
  BuiltInShortcutId,
  RoleShortcutId,
} from "#core/built-in-shortcuts.ts";
import {
  customShortcutsOf,
  effectiveKeymap,
  shortcutHolder,
  withCustomShortcut,
} from "#core/keymap.ts";
import type { CustomShortcuts, FixedKey, Keymap } from "#core/keymap.ts";
import type { Platform } from "#core/platform.ts";
import { SHORTCUT_FAMILIES } from "#core/shortcut-cards.ts";

import { builtInLabel, roleLabel } from "./application-menu.ts";
import type { Command } from "./commands.ts";
import type { SettingsStore } from "./settings.ts";

/** The generated commands, shown as a range on the Shortcuts page and never changed. */
const familyIds = new Set(
  Object.values(SHORTCUT_FAMILIES).flatMap(({ id, count }) =>
    Array.from({ length: count }, (_, index) => id(index + 1))
  )
);

/** The keys held outside the registry on `platform`, each by what holds it. */
const fixedKeys = (platform: Platform): FixedKey[] => [
  ...BUILT_IN_SHORTCUTS.flatMap(({ id, shortcut }) => {
    const accelerator = shortcut[platform];

    return accelerator === undefined
      ? []
      : [{ id: `builtIn:${id}`, accelerator }];
  }),
  ...ZOOM_IN_KEYS.map((accelerator) => ({
    id: "builtIn:zoomIn",
    accelerator,
  })),
  ...ROLE_SHORTCUTS.flatMap(({ id, shortcut }) => {
    const accelerator = shortcut[platform];

    return accelerator === undefined ? [] : [{ id: `role:${id}`, accelerator }];
  }),
];

export interface KeymapDeps {
  platform: Platform;
  appName: string;
  commands: readonly Command[];
  /** Whose `customShortcuts` reads as none while the run is not entitled to it. */
  settings: Pick<SettingsStore, "get" | "update" | "onChange">;
}

/**
 * Each command's key as this run hears it: the platform's defaults with the
 * person's keys over them, while Meru Pro allows. Every surface that shows
 * or hears a key reads it here, and a change is told at once.
 */
export const createKeymap = ({
  platform,
  appName,
  commands,
  settings,
}: KeymapDeps) => {
  const isMacOS = platform === "darwin";
  const defaults = Object.fromEntries(
    commands.map((command) => [command.id, command.shortcut?.[platform]])
  );
  const changeable = new Set(
    commands.map(({ id }) => id).filter((id) => !familyIds.has(id))
  );
  const fixed = fixedKeys(platform);
  let read: { stored: CustomShortcuts; keymap: Keymap } | undefined;

  const current = () => {
    const stored = settings.get("customShortcuts");

    if (read?.stored !== stored) {
      read = {
        stored,
        keymap: effectiveKeymap({
          defaults,
          changeable,
          custom: customShortcutsOf(stored, platform),
          fixed,
          isMacOS,
        }),
      };
    }

    return read.keymap;
  };

  const withKeys = (keymap: Keymap) =>
    commands.map((command): Command => {
      const { [platform]: own, ...others } = command.shortcut ?? {};
      const key = keymap.keys[command.id];

      if (key === own) {
        return command;
      }

      return {
        ...command,
        shortcut: key === undefined ? others : { ...others, [platform]: key },
      };
    });

  let listed: { keymap: Keymap; commands: readonly Command[] } | undefined;

  const holderName = (holder: { command: string } | { fixed: string }) => {
    if ("command" in holder) {
      return commands.find(({ id }) => id === holder.command)?.title() ?? "";
    }

    const [kind, id] = holder.fixed.split(":");

    return kind === "role"
      ? roleLabel(id as RoleShortcutId, appName)
      : builtInLabel(id as BuiltInShortcutId, appName, platform);
  };

  /** Why `accelerator` cannot be the command's key, or `undefined` while it can. */
  const refusal = (id: string, accelerator: string, pressed?: PressedKey) => {
    const holder = shortcutHolder(
      current(),
      fixed,
      id,
      accelerator,
      isMacOS,
      pressed
    );

    if (holder === undefined) {
      return;
    }

    const keys = formatAccelerator(accelerator, platform);
    // Else a title such as "Settings…" ends the sentence in two stops.
    const command = holderName(holder).replace(/…$/u, "");

    return t({
      message: `${keys} is already used for ${command}.`,
      comment:
        "Error on the Shortcuts page of Settings when the keys typed for a command belong to another; {keys} are the keys, such as ⌃⇧R, and {command} the other command's name",
    });
  };

  const write = (id: string, key: string | undefined) => {
    if (!changeable.has(id)) {
      return Promise.reject(new Error(`Command ${id} has no key to change`));
    }

    return settings.update("customShortcuts", (stored) =>
      withCustomShortcut(stored, platform, id, key, defaults[id])
    );
  };

  return {
    current,
    /** Each command's default key on this platform. */
    defaults: (id: string) => defaults[id],
    /** Whether a person may change the command's key. */
    isChangeable: (id: string) => changeable.has(id),
    /** The registry, each command with this run's key on this platform. */
    commands: () => {
      const keymap = current();

      if (listed?.keymap !== keymap) {
        listed = { keymap, commands: withKeys(keymap) };
      }

      return listed.commands;
    },
    /** The command's key on this platform, if it has one. */
    accelerator: (id: string) => current().keys[id],
    /**
     * Gives the command `accelerator`, or no key for `""`; answers why not
     * when another command or a key of the menu's holds it, and changes
     * nothing then; also when another key hears the very key `pressed` that
     * recorded it. Rejects without Meru Pro.
     */
    set: async (id: string, accelerator: string, pressed?: PressedKey) => {
      const refused =
        accelerator === "" ? undefined : refusal(id, accelerator, pressed);

      if (refused === undefined) {
        await write(id, accelerator);
      }

      return refused;
    },
    /**
     * Gives the command its default key again, refused and named like a
     * key typed when another command holds it now.
     */
    reset: async (id: string) => {
      const key = defaults[id];
      const refused = key === undefined ? undefined : refusal(id, key);

      if (refused === undefined) {
        await write(id, undefined);
      }

      return refused;
    },
    /** Told after each change of this run's keys, a license's included. */
    onChange: (listener: () => void) => {
      settings.onChange("customShortcuts", listener);
    },
  };
};

export type KeymapService = ReturnType<typeof createKeymap>;
