/*
 * The child views of the main window, read out of the main process.
 *
 * Accounts and workspace apps are `WebContentsView`s the app attaches to the
 * window itself, painted above the renderer's HTML by the compositor. That is
 * what puts them out of reach of a screenshot — they come out as blank
 * rectangles — and it is why everything about them is asserted from here
 * instead: how many there are, what each has loaded, where it sits, which
 * session it runs in, and which of them is in front.
 */
import type { Rectangle } from "electron";
import type { MeruApp } from "./app";

export type ViewSnapshot = {
  url: string;
  title: string;
  bounds: Rectangle;
  /**
   * Where the view's session keeps its data. A partitioned session names the
   * partition in that path, which is what makes the account a view belongs to
   * readable from the outside.
   */
  storagePath: string;
  isDefaultSession: boolean;
  /**
   * Whether the view throttles when it is backgrounded. What it is for is
   * timing: `createViews` creates every account view with it off and switches it
   * back on once they have all loaded, so a view reporting it on is proof
   * startup has reached that line — which is the only handle a test has on
   * startup steps it cannot otherwise see. Asserting an absence before them
   * passes against an app that was about to do the thing.
   */
  backgroundThrottling: boolean;
};

/**
 * Every child view, in the window's own order — which is z-order, bottom
 * first. The last entry is therefore the view in front, and the app puts the
 * active tab's view there by removing and re-adding it.
 */
export function readViews(meru: MeruApp): Promise<ViewSnapshot[]> {
  return meru.app.evaluate(({ BrowserWindow, session }) => {
    const [window] = BrowserWindow.getAllWindows();

    if (!window) {
      throw new Error("The app has no window");
    }

    return window.contentView.children.map((child) => {
      // Every child is a `WebContentsView` today. Read defensively anyway, so a
      // plain `View` added later reports as a view with nothing loaded rather
      // than throwing somewhere that reads as the app being broken.
      const { webContents } = child as Electron.WebContentsView;

      return {
        url: webContents ? webContents.getURL() : "",
        title: webContents ? webContents.getTitle() : "",
        bounds: child.getBounds(),
        storagePath: webContents ? (webContents.session.storagePath ?? "") : "",
        isDefaultSession: webContents ? webContents.session === session.defaultSession : false,
        backgroundThrottling: webContents ? webContents.backgroundThrottling : false,
      };
    });
  });
}

/** The view that has loaded a URL starting with `urlPrefix`, if one has. */
export function findViewByUrl(views: ViewSnapshot[], urlPrefix: string) {
  return views.find((view) => view.url.startsWith(urlPrefix));
}

/**
 * The space a view leaves over on each side of the window's content area.
 *
 * A workspace app view starts below the titlebar and to the right of the
 * vertical tab strip, and spans everything left — so the left and top gaps are
 * the two chrome measurements, and the right and bottom are zero. Reported as
 * gaps rather than as coordinates because that is what says how far out a view
 * is when it is wrong, and it does not restate the window size the app was
 * given.
 */
export async function readUnfilledSpace(meru: MeruApp, view: ViewSnapshot) {
  const contentBounds = await meru.app.evaluate(({ BrowserWindow }) => {
    const [window] = BrowserWindow.getAllWindows();

    if (!window) {
      throw new Error("The app has no window");
    }

    // The content bounds rather than the window bounds: on Windows the window
    // spans an invisible resize border the content stops short of, and only the
    // content bounds share a coordinate space with the child views.
    return window.getContentBounds();
  });

  return {
    left: view.bounds.x,
    top: view.bounds.y,
    right: contentBounds.width - (view.bounds.x + view.bounds.width),
    bottom: contentBounds.height - (view.bounds.y + view.bounds.height),
  };
}
