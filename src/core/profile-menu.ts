import { menuPointInside } from "./context-menu.ts";
import type { MenuEntry, MenuPoint } from "./context-menu.ts";
import { canSleepProfile, isAsleep } from "./state.ts";
import type { State } from "./state.ts";
import type { Size } from "./window-bounds.ts";

/** Every item a profile button's context menu can hold. */
export const PROFILE_MENU_ITEMS = ["sleep", "wake"] as const;

export type ProfileMenuItemId = (typeof PROFILE_MENU_ITEMS)[number];

/** A profile's menu asked for at a point of the window's content area. */
export interface ProfileMenuRequest extends MenuPoint {
  profileId: string;
}

/**
 * The profile's menu: Wake while it sleeps, else Sleep, disabled for the
 * last awake profile; nothing for a profile not listed.
 */
export const profileMenu = (
  state: State,
  profileId: string
): MenuEntry<ProfileMenuItemId>[] | undefined => {
  const profile = state.profiles.find(
    (candidate) => candidate.id === profileId
  );

  if (!profile) {
    return;
  }

  return isAsleep(state, profile)
    ? [{ kind: "item", id: "wake", enabled: true }]
    : [
        {
          kind: "item",
          id: "sleep",
          enabled: canSleepProfile(state, profileId),
        },
      ];
};

/**
 * The menu for a profile asked for at a point, if the profile is listed and
 * the point in the content area, in whole CSS pixels.
 */
export const profileMenuAt = (
  state: State,
  request: ProfileMenuRequest,
  contentSize: Size
): ProfileMenuRequest | undefined => {
  const { profileId, x, y } = request;

  return menuPointInside(request, contentSize) &&
    state.profiles.some((profile) => profile.id === profileId)
    ? { profileId, x, y }
    : undefined;
};
