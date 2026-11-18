import { chunk } from "es-toolkit";

/** How many pinned tabs a shortcut each selects, the first ones in the area. */
export const PINNED_SHORTCUT_COUNT = 9;

/** The id of the command that selects the pinned tab at `position`, from 1. */
export const selectPinnedCommandId = (position: number) =>
  `tab.pinned.${position}`;

/**
 * v3's key for the pinned tab at `position`: Control, not Command, on macOS
 * too, where Command with Shift and 3 to 6 are the system's screenshots and
 * Command or Control with a digit selects a profile.
 */
export const pinnedShortcut = (position: number) => `Control+Shift+${position}`;

/** The pinned tabs, for the pinned area, and the rest, for the list, each in order. */
export const splitPinned = <T extends { pinned: boolean }>(
  tabs: readonly T[]
) => ({
  pinned: tabs.filter((tab) => tab.pinned),
  listed: tabs.filter((tab) => !tab.pinned),
});

/**
 * The wide sidebar's pinned tiles, two to a row; a tile alone in its row,
 * the last of an odd count, takes the row's whole width.
 */
export const pinnedRows = <T>(tiles: readonly T[]) => chunk([...tiles], 2);
