import type { Session, WebContents } from "electron";
import { getExtensionFrameId } from "../web-navigation/web-navigation";
import type {
  RuntimeProxySender,
  RuntimeProxySenderReport,
  RuntimeProxyTab,
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
 * of. The shim's self-report is only trusted as far as it checks out: the
 * report's URL has to match a live frame in the calling session, and the tab
 * and frame ids come from that frame, never from the report. A report no frame
 * backs — the page navigated away mid-flight — still delivers, as a sender
 * without `tab` and `frameId`.
 */
export function reconstructSender({
  session,
  extensionId,
  report,
  getTabWebContents = getSessionWebContents,
}: ReconstructSenderOptions): RuntimeProxySender {
  const sender: RuntimeProxySender = {
    id: extensionId,
    url: report.url,
    origin: getOrigin(report.url),
  };

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

    if (frame) {
      return {
        ...sender,
        frameId: getExtensionFrameId(frame),
        tab: createTabDetails(contents),
      };
    }
  }

  return sender;
}

function getOrigin(url: string) {
  try {
    return new URL(url).origin;
  } catch {
    return "null";
  }
}
