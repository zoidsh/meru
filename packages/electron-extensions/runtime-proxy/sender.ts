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
 *
 * Exported because the worker's own `tabs.query` and `tabs.get` are answered
 * from main as well (`worker-tabs.ts`), and a tab an extension is handed has
 * one shape whether it arrived on a sender or as a query's answer.
 */
export function createTabDetails(
  contents: WebContents,
  { active }: { active: boolean },
): RuntimeProxyTab {
  return {
    id: contents.id,
    url: contents.getURL(),
    title: contents.getTitle(),
    // Where the page sits in the embedder's UI isn't the proxy's to know, so
    // these carry Chrome's own "no such thing" values rather than a guess
    windowId: -1,
    index: -1,
    // Whether the page is the one its window is showing, which only the
    // embedder can say — a sender says `true`, the page being the one
    // speaking, and a listed tab is asked about (`worker-tabs.ts`). The three
    // move together the way Chrome's do for a window showing one tab
    active,
    highlighted: active,
    selected: active,
    pinned: false,
    incognito: false,
    status: contents.isLoading() ? "loading" : "complete",
    // What Chromium derives Chrome's own `audible` from; Gmail's notification
    // sounds and Meet's audio make this a real value rather than a constant
    audible: contents.isCurrentlyAudible(),
    // The other real value here, and what `tabs.query({muted})` filters on
    mutedInfo: { muted: contents.isAudioMuted() },
    // Tab groups are Chrome UI the embedder has none of, which is what
    // Chrome's own `TAB_GROUP_ID_NONE` says
    groupId: -1,
    // Meru never discards a page out from under an extension
    discarded: false,
    autoDiscardable: true,
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
 * sent it. The shim's self-report still has to match that frame — same origin,
 * same side of the top-frame line — and a report the caller's own frame does
 * not back delivers as `id` alone rather than as the URL it asked for: an
 * extension checking `sender.origin` against its own — which is what 1Password
 * does before it will answer — then refuses it, which is the right way for an
 * unverifiable claim to end.
 *
 * Origin rather than the exact URL, because the exact URL made a same-document
 * navigation — a `pushState` between the shim reading `location.href` and the
 * bridge handling the request — deliver as `id` alone, and Gmail pushStates
 * constantly. What the report is held to is therefore the sending document's
 * origin rather than its URL. The URL it does deliver is still the frame's own,
 * never the report's, so the report buys no field of its own; a context can no
 * more claim a foreign origin than it could a foreign URL, since the caller
 * stamp is a frame Chromium recorded rather than a claim.
 *
 * What keeps that from being a hole is the bridge, not this check. A
 * `WebFrameMain` outlives the document that made the request — Electron
 * re-points one frame instance at each new `RenderFrameHost` — so on its own,
 * origin equality would let a cross-document navigation to another page of the
 * same origin through and attribute the old document's message to the new one.
 * The caller stamp is gated on the frame's token for exactly that reason
 * (`bridge/bridge.ts`), so a frame here is the document that spoke, and the
 * only mismatch left for this check to absorb is the same-document one.
 *
 * Two URLs with no origin of their own — `about:blank`, `data:`, `file:`, an
 * empty URL — compare equal here, since `getOrigin` answers `"null"` for each.
 * Harmless while the frame is the sending document and every field is read off
 * it, but it means an opaque-origin report is not really checked; the honest
 * source would be `WebFrameMain.origin` against the shim's `location.origin`,
 * and what Electron serializes there for extension origins is unverified.
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

  if (
    getOrigin(senderFrame.url) !== getOrigin(report.url) ||
    (senderFrame.parent === null) !== report.isTopFrame
  ) {
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
    // A live caller frame is by definition the active document of its frame.
    // `documentId` has no Electron source — nothing exposes Chromium's
    // per-document token — and stays absent rather than being invented, as
    // does `tlsChannelId`, which Chrome fills only for an extension that asked
    // for it in its manifest
    documentLifecycle: "active",
  };

  const isExtensionPage =
    senderFrame.parent === null && senderFrame.url.startsWith(EXTENSION_SCHEME_PREFIX);

  return isExtensionPage
    ? sender
    : {
        ...sender,
        frameId: getExtensionFrameId(senderFrame),
        // The page is speaking, which is the closest a sender has to "in front"
        tab: createTabDetails(contents, { active: true }),
      };
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
