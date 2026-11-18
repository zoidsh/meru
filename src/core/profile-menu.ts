import { menuPointInside } from "./overlay.ts";
import { isAsleep } from "./state.ts";
import type { State } from "./state.ts";
import type { Size } from "./window-bounds.ts";

/** Every item a profile button's context menu can hold. */
export const PROFILE_MENU_ITEMS = ["sleep", "wake"] as const;

export type ProfileMenuItemId = (typeof PROFILE_MENU_ITEMS)[number];

export interface ProfileMenuItem {
  id: ProfileMenuItemId;
  enabled: boolean;
}

/** A profile's menu asked for at a point of the window's content area. */
export interface ProfileMenuRequest {
  profileId: string;
  x: number;
  y: number;
}

/**
 * What the profile's menu offers: Sleep while it is awake, Wake while it
 * sleeps; nothing for a profile not listed.
 */
export const profileMenuItems = (
  state: State,
  profileId: string
): ProfileMenuItem[] | undefined => {
  const profile = state.profiles.find(
    (candidate) => candidate.id === profileId
  );

  return (
    profile && [{ id: isAsleep(profile) ? "wake" : "sleep", enabled: true }]
  );
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
