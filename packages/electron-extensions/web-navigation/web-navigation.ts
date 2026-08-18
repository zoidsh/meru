import type { Session, WebContents, WebFrameMain } from "electron";
import type { ExtensionBridge } from "../bridge/bridge";
import {
  WEB_NAVIGATION_PATHS,
  type WebNavigationFrameDetails,
  type WebNavigationFrameQuery,
} from "./bridge-protocol";

/** Chromium addresses a tab's main frame as frame 0 in every extension API. */
const MAIN_FRAME_ID = 0;

/**
 * The id an extension addresses a frame by: Chromium's frame-tree-node id, with
 * the main frame pinned to 0 — which is why the main frame never answers to its
 * own node id.
 */
function getExtensionFrameId(frame: WebFrameMain) {
  return frame.parent ? frame.frameTreeNodeId : MAIN_FRAME_ID;
}

function createFrameDetails(frame: WebFrameMain): WebNavigationFrameDetails {
  return {
    frameId: getExtensionFrameId(frame),
    parentFrameId: frame.parent ? getExtensionFrameId(frame.parent) : -1,
    processId: frame.processId,
    url: frame.url,
    errorOccurred: false,
    frameType: frame.parent ? "sub_frame" : "outermost_frame",
    documentLifecycle: "active",
  };
}

export type WebNavigationOptions = {
  /** How a tab id resolves to the WebContents behind it, Electron's mapping by default. */
  getWebContentsById?: (tabId: number) => WebContents | undefined;
};

/**
 * Resolved at call time: a value import of "electron" cannot even be loaded
 * outside Electron, which is where this module's tests run.
 */
function getElectronWebContentsById(tabId: number) {
  const { webContents } = require("electron") as typeof import("electron");

  return webContents.fromId(tabId);
}

/**
 * `chrome.webNavigation.getFrame` and `getAllFrames` for extensions loaded into
 * Electron sessions, answered over the extension bridge — Electron implements
 * no webNavigation at all. The frame queries are what a fill-style flow hangs
 * on: 1Password's worker relays a command from its inline-menu iframe to the
 * frame owning the form only after `getFrame` has named that frame's parent,
 * and the facade's former noop `null` dropped the relay silently.
 *
 * Extension frame ids are frame-tree-node ids with the main frame pinned to 0,
 * which is exactly what `WebFrameMain` exposes; tab ids are `WebContents` ids,
 * Electron's own tabs mapping. The namespace's events stay noops in the facade.
 */
export class WebNavigation {
  private getWebContentsById: (tabId: number) => WebContents | undefined;

  constructor({ getWebContentsById }: WebNavigationOptions = {}) {
    this.getWebContentsById = getWebContentsById ?? getElectronWebContentsById;
  }

  registerRoutes(bridge: ExtensionBridge) {
    bridge.handle(WEB_NAVIGATION_PATHS.getFrame, ({ session, body, headers }) =>
      Response.json(this.getFrame(session, body.details as WebNavigationFrameQuery), { headers }),
    );

    bridge.handle(WEB_NAVIGATION_PATHS.getAllFrames, ({ session, body, headers }) =>
      Response.json(this.getAllFrames(session, body.details as WebNavigationFrameQuery), {
        headers,
      }),
    );
  }

  /** Chrome answers `null` for a frame it cannot find, never an error. */
  getFrame(
    session: Session,
    query: WebNavigationFrameQuery | undefined,
  ): WebNavigationFrameDetails | null {
    const contents = this.getTabContents(session, query?.tabId);

    if (!contents || typeof query?.frameId !== "number") {
      return null;
    }

    // Destroyed first: a disposed frame's other accessors throw, and one dead
    // frame in the subtree must not fail a query for a live one
    const frame =
      query.frameId === MAIN_FRAME_ID
        ? contents.mainFrame
        : contents.mainFrame.framesInSubtree.find(
            (candidate) =>
              !candidate.isDestroyed() &&
              candidate.parent !== null &&
              candidate.frameTreeNodeId === query.frameId,
          );

    if (!frame || frame.isDestroyed()) {
      return null;
    }

    return createFrameDetails(frame);
  }

  getAllFrames(
    session: Session,
    query: WebNavigationFrameQuery | undefined,
  ): WebNavigationFrameDetails[] | null {
    const contents = this.getTabContents(session, query?.tabId);

    if (!contents) {
      return null;
    }

    return contents.mainFrame.framesInSubtree
      .filter((frame) => !frame.isDestroyed())
      .map((frame) => createFrameDetails(frame));
  }

  /**
   * A tab id resolves only within the session that asked: every session runs
   * its own extension instances, and an id from any other session is another
   * account's page.
   */
  private getTabContents(session: Session, tabId: unknown) {
    if (typeof tabId !== "number") {
      return undefined;
    }

    const contents = this.getWebContentsById(tabId);

    if (!contents || contents.isDestroyed() || contents.session !== session) {
      return undefined;
    }

    return contents;
  }
}
