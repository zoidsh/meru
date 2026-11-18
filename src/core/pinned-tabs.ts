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
