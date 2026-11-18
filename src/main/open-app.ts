import type { App } from "#core/apps.ts";
import { openableApps } from "#core/open-app.ts";
import type { State } from "#core/state.ts";

import type { Overlays } from "./overlay.ts";

export interface OpenAppDeps {
  /** The registry, or the suite's stand-ins for it. */
  apps: readonly App[];
  state: () => State;
  overlays: Pick<Overlays, "open" | "close" | "current">;
  /** Opens `url` as a tab of `app` in the profile, selected. */
  openTab: (profileId: string, app: App, url: string) => Promise<unknown>;
  log: (message: string) => void;
}

/**
 * The Open app overlay, over the selected profile: it lists what that
 * profile can open, and choosing one closes it and opens the app's home as a
 * new tab, selected, as a link to it would; focus follows the new tab.
 */
export const createOpenApp = ({
  apps,
  state,
  overlays,
  openTab,
  log,
}: OpenAppDeps) => {
  const current = () => {
    const open = overlays.current();

    return open?.kind === "open-app" ? open : undefined;
  };

  return {
    isOpen: () => current() !== undefined,
    /** Opens it over the selected profile, replacing any other, or closes it. */
    setOpen: (open: boolean) => {
      if (open) {
        overlays.open({
          kind: "open-app",
          profileId: state().selectedProfileId,
        });
      } else if (current()) {
        overlays.close();
      }
    },
    /**
     * Opens the app, only one the open overlay lists, so a shell cannot
     * name another or another profile.
     */
    choose: async (appId: string) => {
      const open = current();
      const profile =
        open && state().profiles.find(({ id }) => id === open.profileId);
      const app =
        profile && openableApps(apps, profile).find(({ id }) => id === appId);

      if (!open || !app) {
        log(`Refused to open ${appId}, which Open app does not list`);

        return;
      }

      overlays.close();
      await openTab(open.profileId, app, app.home);
    },
  };
};

export type OpenApp = ReturnType<typeof createOpenApp>;
