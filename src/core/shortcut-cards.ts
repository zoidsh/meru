import { PINNED_SHORTCUT_COUNT, selectPinnedCommandId } from "./pinned-tabs.ts";
import {
  PROFILE_SHORTCUT_COUNT,
  selectProfileCommandId,
} from "./profile-shortcuts.ts";

/** A menu or an item of one, as an Electron menu template has it. */
export interface MenuOutline {
  label?: string | undefined;
  id?: string | undefined;
  submenu?: unknown;
}

/** The generated commands that the page shows as one row each. */
export const SHORTCUT_FAMILIES = {
  pinned: { id: selectPinnedCommandId, count: PINNED_SHORTCUT_COUNT },
  profile: { id: selectProfileCommandId, count: PROFILE_SHORTCUT_COUNT },
} as const;

export type ShortcutFamily = keyof typeof SHORTCUT_FAMILIES;

export type ShortcutRow =
  | { family?: undefined; id: string }
  /** A family's first and last command, standing for all of them. */
  | { family: ShortcutFamily; first: string; last: string };

export interface ShortcutCard {
  /** The menu's name as the menu bar shows it. */
  menu: string;
  rows: ShortcutRow[];
}

const familyOf = (id: string) =>
  (Object.keys(SHORTCUT_FAMILIES) as ShortcutFamily[]).find((family) => {
    const { id: idOf, count } = SHORTCUT_FAMILIES[family];

    return Array.from({ length: count }, (_, index) =>
      idOf(index + 1)
    ).includes(id);
  });

/** The ids of a menu's items, its submenus' in place, in the menu's order. */
const itemIds = (items: unknown): string[] =>
  Array.isArray(items)
    ? (items as MenuOutline[]).flatMap((item) => [
        ...(item.id === undefined ? [] : [item.id]),
        ...itemIds(item.submenu),
      ])
    : [];

/**
 * The registry's commands by the menu they sit in, in the menu bar's order
 * and each menu's: an item counts when its id is one of `commandIds`, a
 * family's members make one row where the first of them sits, and a menu
 * with none of them has no card.
 */
export const shortcutCards = (
  menus: readonly MenuOutline[],
  commandIds: ReadonlySet<string>
): ShortcutCard[] => {
  const seen = new Set<ShortcutFamily>();

  return menus.flatMap((menu) => {
    const rows = itemIds(menu.submenu).flatMap((id): ShortcutRow[] => {
      if (!commandIds.has(id)) {
        return [];
      }

      const family = familyOf(id);

      if (family === undefined) {
        return [{ id }];
      }

      if (seen.has(family)) {
        return [];
      }

      seen.add(family);

      const { id: idOf, count } = SHORTCUT_FAMILIES[family];

      return [{ family, first: idOf(1), last: idOf(count) }];
    });

    return rows.length > 0 ? [{ menu: menu.label ?? "", rows }] : [];
  });
};
