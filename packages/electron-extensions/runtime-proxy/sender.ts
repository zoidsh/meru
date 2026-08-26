import type { Session, WebContents } from "electron";
import { getExtensionFrameId } from "../web-navigation/web-navigation";
import {
  EXTENSION_SCHEME_PREFIX,
  type RuntimeProxySender,
  type RuntimeProxySenderReport,
  type RuntimeProxyTab,
} from "./bridge-protocol";

/**
 * How the relay finds the pages that count as tabs in a session,
 * every live `WebContents` of the session by default.
 */
export type RuntimeProxyTabsProvider = (session: Session) => WebContents[];

/**
 * Resolved at call time: a value import of "electron" cannot even be loaded
 * outside Electron, which is where this module's tests run.
 */
function getSessionWebContents(session: Session) {
  const { webContents } = require("electron") as typeof import("electron");

  return webContents
    .getAllWebContents()
    .filter((contents) => !contents.isDestroyed() && contents.session === session);
}

export function parseSenderReport(reported: unknown): RuntimeProxySenderReport | undefined {
  if (typeof reported !== "object" || reported === null) {
    return undefined;
  }

  const { url, isTopFrame } = reported as Record<string, unknown>;

  if (typeof url !== "string" || typeof isTopFrame !== "boolean") {
    return undefined;
  }

  return { url, isTopFrame };
}

/**
 * The tab ids the proxy hands out are `WebContents` ids, which Electron numbers
 * across the whole app — that is the unified namespace the proxy needs, since
 * Chromium's own extension tab ids start over per session and two sessions'
 * tabs would collide the moment one worker serves both. It is also the mapping
 * the bridge's webNavigation frame queries already answer in, so a sender's
 * `tab.id` means the same thing everywhere the bridge speaks.
 */
function createTabDetails(contents: WebContents): RuntimeProxyTab {
  return {
    id: contents.id,
    url: contents.getURL(),
    title: contents.getTitle(),
    // Where the page sits in the embedder's UI isn't the proxy's to know, so
    // these carry Chrome's own "no such thing" values rather than a guess
    windowId: -1,
    index: -1,
    // The page is speaking, which is the closest this layer has to "in front"
    active: true,
    highlighted: true,
    pinned: false,
    incognito: false,
  };
}

export type ReconstructSenderOptions = {
  session: Session;
  extensionId: string;
  report: RuntimeProxySenderReport;
  getTabWebContents?: RuntimeProxyTabsProvider;
};

/**
 * Builds the `MessageSender` a relayed message hands the worker, which native
 * in-session messaging gets from Chromium and a bridge request carries nothing
 * of.
 *
 * Nothing the shim reports is passed on unbacked. A live frame of the calling
 * session has to be at the reported URL, on the reported side of the top-frame
 * line, and the sender is built from that frame — `url` and `origin` only
 * because a frame was found to hold them. A report no frame backs delivers as
 * `id` alone rather than as the URL it asked for: an extension checking
 * `sender.origin` against its own — which is what 1Password does before it will
 * answer — then refuses it, which is the right way for an unverifiable claim to
 * end.
 *
 * A top-level extension page is no tab, so it stops there. Chrome gives an
 * action popup's messages a sender of `id`, `url` and `origin` alone, and that
 * is what the worker sees — the popup's own view is not reported as a tab
 * merely because it is a `WebContents` of the session. An extension page in a
 * subframe is a different thing: 1Password's inline menu is an iframe of the
 * extension inside a web page, and it keeps the host tab and its frame id.
 * Meru renders extension pages only as the popup; Chrome would hand one opened
 * in a browser tab a `tab`, and there is no such surface here.
 *
 * What this cannot do is bind a message to the frame that sent it.
 * `protocol.handle` hands the bridge the session and never the calling frame
 * (`bridge/bridge.ts`), so one context of the extension in a session can still
 * report another live frame's URL in that same session and be believed. The
 * bridge token is what stands between a page and any of this, and it is the
 * extension's own contexts that hold it; this narrows a forged sender to URLs
 * the session really has open, and does not eliminate it.
 */
export function reconstructSender({
  session,
  extensionId,
  report,
  getTabWebContents = getSessionWebContents,
}: ReconstructSenderOptions): RuntimeProxySender {
  const isExtensionPage = report.isTopFrame && report.url.startsWith(EXTENSION_SCHEME_PREFIX);

  for (const contents of getTabWebContents(session)) {
    if (contents.isDestroyed()) {
      continue;
    }

    const frame = contents.mainFrame.framesInSubtree.find(
      (candidate) =>
        !candidate.isDestroyed() &&
        candidate.url === report.url &&
        (candidate.parent === null) === report.isTopFrame,
    );

    if (!frame) {
      continue;
    }

    const sender: RuntimeProxySender = {
      id: extensionId,
      url: report.url,
      origin: getOrigin(report.url),
    };

    return isExtensionPage
      ? sender
      : { ...sender, frameId: getExtensionFrameId(frame), tab: createTabDetails(contents) };
  }

  // The session holds nothing the report describes, so none of it is passed on
  return { id: extensionId };
}

function getOrigin(url: string) {
  if (url.startsWith(EXTENSION_SCHEME_PREFIX)) {
    const extensionId = url.slice(EXTENSION_SCHEME_PREFIX.length).replace(/[/?#].*$/, "");

    return `${EXTENSION_SCHEME_PREFIX}${extensionId}`;
  }

  try {
    return new URL(url).origin;
  } catch {
    return "null";
  }
}
