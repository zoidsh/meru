/** How many profiles a shortcut each selects, the first ones in the row. */
export const PROFILE_SHORTCUT_COUNT = 9;

/** The id of the command that selects the profile at `position`, from 1. */
export const selectProfileCommandId = (position: number) =>
  `profile.select.${position}`;
