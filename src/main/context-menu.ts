import type { MenuEntry } from "#core/context-menu.ts";
import type { Platform } from "#core/platform.ts";
import type { ContextMenuItem } from "#platform/context-menu.ts";

import type { Command } from "./commands.ts";

export interface NativeMenuOptions<Id extends string> {
  /** The item's label in the person's language, as it reads now. */
  label: (id: Id) => string;
  /** The shortcut the registry gives the command on this platform, if any. */
  accelerator?: (command: string) => string | undefined;
  /** What it gives, as a promise of the item's work, the menu ignores. */
  choose: (id: Id) => unknown;
}

/** A menu's description as the native menu shows it. */
export const nativeMenu = <Id extends string>(
  entries: readonly MenuEntry<Id>[],
  { label, accelerator, choose }: NativeMenuOptions<Id>
): ContextMenuItem[] =>
  entries.map((entry): ContextMenuItem => {
    if (entry.kind === "separator") {
      return { type: "separator" };
    }

    const shown =
      entry.command === undefined ? undefined : accelerator?.(entry.command);

    return {
      label: label(entry.id),
      enabled: entry.enabled,
      ...(entry.checked !== undefined && { checked: entry.checked }),
      ...(shown !== undefined && { accelerator: shown }),
      click: () => choose(entry.id),
    };
  });

/** What gives the shortcut the registry gives a command on this platform. */
export const commandAccelerator =
  (commands: readonly Pick<Command, "id" | "shortcut">[], platform: Platform) =>
  (id: string) =>
    commands.find((command) => command.id === id)?.shortcut?.[platform];
