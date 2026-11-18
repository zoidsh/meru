import { t } from "@lingui/core/macro";

import { menuItem } from "#core/context-menu.ts";
import { profileMenu, profileMenuAt } from "#core/profile-menu.ts";
import type {
  ProfileMenuItemId,
  ProfileMenuRequest,
} from "#core/profile-menu.ts";
import type { State } from "#core/state.ts";
import type { PlainWindow } from "#platform/base-window.ts";

import { nativeMenu } from "./context-menu.ts";
import type { Profiles } from "./profiles.ts";

export interface ProfileMenuDeps {
  state: () => State;
  /** The main window, whose sidebar asks for a profile's menu. */
  window: Pick<PlainWindow, "showContextMenu" | "getContentAreaSize">;
  profiles: Pick<Profiles, "select" | "sleep">;
  log: (message: string) => void;
}

const describe = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const label = (id: ProfileMenuItemId) =>
  id === "sleep"
    ? t({
        message: "Sleep",
        comment:
          "Item of a profile button's context menu that closes every page of the profile until it is woken, its mail still checked",
      })
    : t({
        message: "Wake",
        comment:
          "Item of a sleeping profile's context menu, in place of Sleep, that selects the profile and loads its pages again",
      });

/**
 * A profile button's context menu, a native menu popped up at the point the
 * shell names: Sleep, or Wake, which selects the profile as every way to it
 * does. An item runs only if the menu offers it, enabled, when it is chosen.
 */
export const createProfileMenu = ({
  state,
  window,
  profiles,
  log,
}: ProfileMenuDeps) => {
  const choose = async (profileId: string, item: ProfileMenuItemId) => {
    try {
      if (!menuItem(profileMenu(state(), profileId), item)?.enabled) {
        log(`Refused the profile menu's ${item}, which it does not offer`);
      } else if (item === "sleep") {
        await profiles.sleep(profileId);
      } else {
        await profiles.select(profileId);
      }
    } catch (error) {
      log(`The profile menu's ${item} failed: ${describe(error)}`);
    }
  };

  return {
    open: (request: ProfileMenuRequest) => {
      const at = profileMenuAt(state(), request, window.getContentAreaSize());
      const entries = at && profileMenu(state(), at.profileId);

      if (!at || !entries) {
        log(
          `Refused a menu for profile ${request.profileId} at ${request.x},${request.y}`
        );

        return;
      }

      window.showContextMenu(
        nativeMenu(entries, {
          label,
          choose: (item) => choose(at.profileId, item),
        }),
        { x: at.x, y: at.y }
      );
    },
  };
};

export type ProfileMenu = ReturnType<typeof createProfileMenu>;
