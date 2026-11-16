import { contentViewBounds } from "#core/layout.ts";
import { profilePartition } from "#core/state.ts";
import type { State } from "#core/state.ts";
import { planViews } from "#core/views.ts";
import { routeWindowOpen } from "#core/window-open.ts";
import type { ContentView } from "#platform/content-view.ts";
import type { SystemBrowser } from "#platform/system-browser.ts";
import type { AppWindow } from "#platform/window.ts";

import type { SenderRegistry } from "./senders.ts";

export interface ProfileViewsDeps {
  window: Pick<
    AppWindow,
    "getContentAreaSize" | "onContentAreaResize" | "addContentView"
  >;
  /** Gmail, or the suite's stand-in for it. */
  url: string;
  /** Origins whose pop-ups open as child windows in the session. */
  childWindowOrigins: readonly string[];
  background: boolean;
  systemBrowser: SystemBrowser;
  senders: Pick<SenderRegistry, "register">;
  log: (message: string) => void;
}

const describe = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/**
 * Keeps the window's Gmail views matching the profiles: one per profile once
 * it has been selected, in its own session, below the titlebar, with only the
 * selected one visible. A load that fails is logged and left.
 */
export const createProfileViews = ({
  window,
  url,
  childWindowOrigins,
  background,
  systemBrowser,
  senders,
  log,
}: ProfileViewsDeps) => {
  const views = new Map<string, ContentView>();

  const bounds = () => contentViewBounds(window.getContentAreaSize());

  const openInSystemBrowser = async (openedUrl: string) => {
    try {
      await systemBrowser.open(openedUrl);
    } catch (error) {
      log(`The system browser did not open a link: ${describe(error)}`);
    }
  };

  const load = async (view: ContentView) => {
    try {
      await view.loadURL(url);
    } catch (error) {
      log(`Gmail did not load: ${describe(error)}`);
    }
  };

  const create = (profileId: string) => {
    const view = window.addContentView({
      partition: profilePartition(profileId),
      background,
      onWindowOpen: (openedUrl) => {
        const route = routeWindowOpen(openedUrl, childWindowOrigins);

        if (route === "system-browser") {
          openInSystemBrowser(openedUrl);
        }

        return route === "child-window" ? "allow" : "deny";
      },
      onWebContents: (webContentsId, role) =>
        senders.register(webContentsId, { role, profileId }),
    });

    view.setBounds(bounds());
    load(view);

    return view;
  };

  window.onContentAreaResize(() => {
    for (const view of views.values()) {
      view.setBounds(bounds());
    }
  });

  return {
    /** Creates, closes, shows and hides views until the window matches. */
    reconcile: (state: State) => {
      const plan = planViews(state, [...views.keys()]);

      for (const [profileId, view] of views) {
        if (!plan.profileIds.includes(profileId)) {
          views.delete(profileId);

          try {
            view.close();
          } catch (error) {
            log(
              `The view of profile ${profileId} did not close: ${describe(error)}`
            );
          }
        }
      }

      for (const profileId of plan.profileIds) {
        if (!views.has(profileId)) {
          views.set(profileId, create(profileId));
        }
      }

      for (const [profileId, view] of views) {
        view.setVisible(profileId === plan.visibleProfileId);
      }
    },
  };
};
