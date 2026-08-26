import type { Session, WebContents, WebFrameMain } from "electron";
import { getExtensionFrameId } from "../web-navigation/web-navigation";
import {
  EXTENSION_SCHEME_PREFIX,
  type RuntimeProxySender,
  type RuntimeProxySenderReport,
  type RuntimeProxyTab,
} from "./bridge-protocol";

/**
 * How a verified caller frame resolves to the `WebContents` hosting it,
 * Electron's own mapping by default.
 */
export type GetWebContentsFromFrame = (frame: WebFrameMain) => WebContents | undefined;

/**
 * Resolved at call time: a value import of "electron" cannot even be loaded
 * outside Electron, which is where this module's tests run.
 */
function getElectronWebContentsFromFrame(frame: WebFrameMain) {
  const { webContents } = require("electron") as typeof import("electron");

  return webContents.fromFrame(frame);
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
  /**
   * The frame Chromium recorded as the bridge request's initiator, from the
   * caller stamp the bridge put on the request (`bridge/bridge.ts`) — the one
   * part of the sender the shim has no hand in.
   */
  senderFrame: WebFrameMain | undefined;
  getWebContentsFromFrame?: GetWebContentsFromFrame;
};

/**
 * Builds the `MessageSender` a relayed message hands the worker, which native
 * in-session messaging gets from Chromium and a bridge request carries nothing
 * of.
 *
 * The sender is built from the frame the bridge recorded as the request's
 * caller, never from any frame that merely resembles the report: with one URL
 * open in two tabs of a session, the message is attributed to the tab that
 * sent it. The shim's self-report still has to match that frame — same URL,
 * same side of the top-frame line — and a report the caller's own frame does
 * not back delivers as `id` alone rather than as the URL it asked for: an
 * extension checking `sender.origin` against its own — which is what 1Password
 * does before it will answer — then refuses it, which is the right way for an
 * unverifiable claim to end. A mismatch is a document that navigated between
 * the shim reading `location.href` and the request being handled, or a report
 * that was never true, and neither is delivered.
 *
 * A top-level extension page is no tab, so it stops there. Chrome gives an
 * action popup's messages a sender of `id`, `url` and `origin` alone, and that
 * is what the worker sees — the popup's own view is not reported as a tab
 * merely because it is a `WebContents` of the session. An extension page in a
 * subframe is a different thing: 1Password's inline menu is an iframe of the
 * extension inside a web page, and it keeps the host tab and its frame id.
 * Meru renders extension pages only as the popup; Chrome would hand one opened
 * in a browser tab a `tab`, and there is no such surface here.
 */
export function reconstructSender({
  session,
  extensionId,
  report,
  senderFrame,
  getWebContentsFromFrame = getElectronWebContentsFromFrame,
}: ReconstructSenderOptions): RuntimeProxySender {
  if (!senderFrame || senderFrame.isDestroyed()) {
    return { id: extensionId };
  }

  if (senderFrame.url !== report.url || (senderFrame.parent === null) !== report.isTopFrame) {
    return { id: extensionId };
  }

  const contents = getWebContentsFromFrame(senderFrame);

  if (!contents || contents.isDestroyed() || contents.session !== session) {
    return { id: extensionId };
  }

  const sender: RuntimeProxySender = {
    id: extensionId,
    url: senderFrame.url,
    origin: getOrigin(senderFrame.url),
  };

  const isExtensionPage =
    senderFrame.parent === null && senderFrame.url.startsWith(EXTENSION_SCHEME_PREFIX);

  return isExtensionPage
    ? sender
    : { ...sender, frameId: getExtensionFrameId(senderFrame), tab: createTabDetails(contents) };
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
