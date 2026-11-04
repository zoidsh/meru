import type { WebContents } from "electron";
import { openExternalUrl } from "@/url";
import { isWebUrl } from "./deep-link";
import { loadUrl } from "./load-url";
import { log } from "./log";

function getDocumentUrl(url: string) {
  return url.split(/[?#]/, 1)[0];
}

/**
 * Only a web link goes to the browser: `shell.openExternal` hands any other
 * scheme, `file:` and `smb:` among them, to whatever the system registered.
 */
function openWebUrlInBrowser(url: string) {
  if (isWebUrl(url)) {
    openExternalUrl(url, { skipTrustedHostCheck: true });
  }
}

/**
 * Whatever a renderer page's `webContents` loads gets every IPC channel through
 * the renderer preload, so it stays on the page it was loaded with, compared
 * without the query and fragment so that a reload, the dev server's included,
 * and hash routing still go through.
 *
 * The page is the document the first load commits, as Chromium spells it,
 * rather than `pageUrl`: Chromium canonicalizes a file URL per platform, and
 * uppercases a Windows drive letter that Node's `pathToFileURL` keeps as given.
 * Nothing in the page can run before that first commit.
 *
 * Chromium runs no navigation throttles for a navigation that needs no URL
 * loader, such as `about:blank` and `about:srcdoc`, so those never reach
 * `will-navigate` and commit anyway. Nor can they be stopped once started:
 * `stop()` from `did-start-navigation` hangs the main process, and a deferred
 * one arrives after the commit. So a document that commits elsewhere is
 * replaced by the page again, once: should that load commit somewhere else as
 * well, loading it again would only repeat that forever.
 */
export function keepOnRendererPage(webContents: WebContents, pageUrl: string) {
  let pageDocumentUrl: string | undefined;

  let isReturning = false;

  const isOnPage = (url: string) => getDocumentUrl(url) === pageDocumentUrl;

  webContents.on("will-navigate", (event, url) => {
    if (isOnPage(url)) {
      return;
    }

    event.preventDefault();

    openWebUrlInBrowser(url);
  });

  // A load that failed before anything committed left nothing to replace.
  const returnToPage = () => {
    const url = webContents.getURL();

    if (!url || isOnPage(url)) {
      isReturning = false;

      return;
    }

    if (isReturning) {
      isReturning = false;

      log.error("Renderer page did not come back", { pageUrl, url });

      return;
    }

    isReturning = true;

    loadUrl(webContents, pageUrl);
  };

  webContents.on("did-navigate", (_event, url) => {
    if (pageDocumentUrl === undefined) {
      pageDocumentUrl = getDocumentUrl(url);
    }

    returnToPage();
  });

  // `about:srcdoc` in a main frame commits as an error page, reported only here.
  webContents.on("did-fail-load", (_event, _errorCode, _errorDescription, _url, isMainFrame) => {
    if (isMainFrame && pageDocumentUrl !== undefined) {
      returnToPage();
    }
  });

  webContents.setWindowOpenHandler(({ url }) => {
    openWebUrlInBrowser(url);

    return { action: "deny" };
  });
}
