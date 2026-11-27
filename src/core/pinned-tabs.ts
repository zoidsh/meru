/** How many pinned tabs a shortcut each selects, the first ones in the area. */
export const PINNED_SHORTCUT_COUNT = 9;

/** The id of the command that selects the pinned tab at `position`, from 1. */
export const selectPinnedCommandId = (position: number) =>
  `tab.pinned.${position}`;
