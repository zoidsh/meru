import { contentViewBounds } from "#core/layout.ts";
import { routeWindowOpen } from "#core/window-open.ts";
import type { SystemBrowser } from "#platform/system-browser.ts";
import type { AppWindow } from "#platform/window.ts";

export interface GmailViewDeps {
  window: Pick<
    AppWindow,
    "getContentAreaSize" | "onContentAreaResize" | "addContentView"
  >;
  partition: string;
  url: string;
  /** Origins whose pop-ups open as child windows in the session. */
  childWindowOrigins: readonly string[];
  background: boolean;
  systemBrowser: SystemBrowser;
  log: (message: string) => void;
}

const describe = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/**
 * Shows a profile's Gmail below the titlebar, following the window's size. A
 * load that fails is logged and left; nothing waits on it.
 */
export const createGmailView = ({
  window,
  partition,
  url,
  childWindowOrigins,
  background,
  systemBrowser,
  log,
}: GmailViewDeps) => {
  const openInSystemBrowser = async (openedUrl: string) => {
    try {
      await systemBrowser.open(openedUrl);
    } catch (error) {
      log(`The system browser did not open a link: ${describe(error)}`);
    }
  };

  const view = window.addContentView({
    partition,
    background,
    onWindowOpen: (openedUrl) => {
      const route = routeWindowOpen(openedUrl, childWindowOrigins);

      if (route === "system-browser") {
        openInSystemBrowser(openedUrl);
      }

      return route === "child-window" ? "allow" : "deny";
    },
  });

  const place = () => {
    view.setBounds(contentViewBounds(window.getContentAreaSize()));
  };

  const load = async () => {
    try {
      await view.loadURL(url);
    } catch (error) {
      log(`Gmail did not load: ${describe(error)}`);
    }
  };

  place();
  window.onContentAreaResize(place);
  load();
};
