import type { Size } from "./window-bounds.ts";

/**
 * An entry of a menu as Meru describes it, before main names it in the
 * person's language: an item by `id`, or a line between groups.
 */
export type MenuEntry<Id extends string> =
  | {
      kind: "item";
      id: Id;
      enabled: boolean;
      /** A checkbox item's state; none for an item that is not one. */
      checked?: boolean;
      /** The registry command whose shortcut the item shows, if it has one. */
      command?: string;
    }
  | { kind: "separator" };

export type MenuItemEntry<Id extends string> = Extract<
  MenuEntry<Id>,
  { kind: "item" }
>;

/** The groups' items in order, a line between each two, an empty group left out. */
export const menuOfGroups = <Id extends string>(
  groups: readonly (readonly MenuItemEntry<Id>[])[]
): MenuEntry<Id>[] =>
  groups
    .filter((group) => group.length > 0)
    .flatMap((group, index) =>
      index === 0 ? [...group] : [{ kind: "separator" as const }, ...group]
    );

/** The item of `menu` with this id, if it offers it. */
export const menuItem = <Id extends string>(
  menu: readonly MenuEntry<Id>[] | undefined,
  id: Id
) =>
  menu?.find(
    (entry): entry is MenuItemEntry<Id> =>
      entry.kind === "item" && entry.id === id
  );

/** A point a menu is asked to open at, in the window's content area. */
export interface MenuPoint {
  x: number;
  y: number;
}

/** Whether a menu's point lies in the content area, in whole CSS pixels. */
export const menuPointInside = ({ x, y }: MenuPoint, contentSize: Size) =>
  Number.isInteger(x) &&
  Number.isInteger(y) &&
  x >= 0 &&
  y >= 0 &&
  x <= contentSize.width &&
  y <= contentSize.height;
