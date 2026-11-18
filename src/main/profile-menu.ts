import { profileMenuAt, profileMenuItems } from "#core/profile-menu.ts";
import type {
  ProfileMenuItemId,
  ProfileMenuRequest,
} from "#core/profile-menu.ts";
import type { State } from "#core/state.ts";
import type { Size } from "#core/window-bounds.ts";

import type { Overlays } from "./overlay.ts";
import type { Profiles } from "./profiles.ts";

export interface ProfileMenuDeps {
  state: () => State;
  /** The window's content area, which a menu's point must lie in. */
  contentSize: () => Size;
  overlays: Pick<Overlays, "open" | "close" | "current">;
  profiles: Pick<Profiles, "select" | "sleep">;
  log: (message: string) => void;
}

const describe = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/**
 * A profile button's context menu, drawn by the shell in the overlay's view:
 * Sleep, or Wake, which selects the profile as every way to it does.
 */
export const createProfileMenu = ({
  state,
  contentSize,
  overlays,
  profiles,
  log,
}: ProfileMenuDeps) => {
  let running = false;

  return {
    open: (request: ProfileMenuRequest) => {
      const at = profileMenuAt(state(), request, contentSize());

      if (!at) {
        log(
          `Refused a menu for profile ${request.profileId} at ${request.x},${request.y}`
        );

        return;
      }

      overlays.open({ kind: "profile-menu", ...at });
    },
    /**
     * Runs the item on the open menu's profile, if the menu offers it, and
     * closes that menu, one item at a time.
     */
    run: async (item: ProfileMenuItemId) => {
      const open = overlays.current();

      if (open?.kind !== "profile-menu") {
        log(`Refused the profile menu's ${item} with no profile menu open`);

        return;
      }

      // A second press before main closes the menu would run it again.
      if (running) {
        log(`Refused the profile menu's ${item} while another item runs`);

        return;
      }

      running = true;

      const offered = profileMenuItems(state(), open.profileId)?.find(
        (candidate) => candidate.id === item
      );

      try {
        if (!offered?.enabled) {
          log(`Refused the profile menu's ${item}, which it does not offer`);
        } else if (item === "sleep") {
          await profiles.sleep(open.profileId);
        } else {
          await profiles.select(open.profileId);
        }
      } catch (error) {
        log(`The profile menu's ${item} failed: ${describe(error)}`);
      } finally {
        running = false;

        // Whatever opened while a slow item ran is not this menu's to close.
        if (overlays.current() === open) {
          overlays.close();
        }
      }
    },
  };
};

export type ProfileMenu = ReturnType<typeof createProfileMenu>;
