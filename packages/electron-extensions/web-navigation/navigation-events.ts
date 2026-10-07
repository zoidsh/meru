import type { Event as ElectronEvent, Session, WebContents, WebFrameMain } from "electron";
import type { ExtensionBridge } from "../bridge/bridge";
import type { ExtensionsLogger } from "../logger";
import { encodeNativeMessage } from "../native-messaging/framing";
import {
  WEB_NAVIGATION_PATHS,
  type WebNavigationEventDetails,
  type WebNavigationEventFrame,
  type WebNavigationEventName,
} from "./bridge-protocol";
import { getExtensionFrameId } from "./web-navigation";

export type NavigationEventsPolicy = (extensionId: string) => boolean;

export type NavigationEventsOptions = {
  /**
   * Which extensions hear the events, by the id they are loaded as. Without it
   * none does, and nothing is ever attached to a page.
   */
  deliversNavigationEvents?: NavigationEventsPolicy;
  /** The same rule `WebNavigation` resolves a frame query's tab by. */
  canResolveTabAcrossSessions?: (askingSession: Session, tabSession: Session) => boolean;
  getAllWebContents?: () => WebContents[];
  /** Subscribes to every `WebContents` created from now on, returning the unsubscribe. */
  onWebContentsCreated?: (listener: (contents: WebContents) => void) => () => void;
  now?: () => number;
  logger?: ExtensionsLogger;
};

type ParkedStream = {
  session: Session;
  extensionId: string;
  controller: ReadableStreamDefaultController<Uint8Array>;
};

/**
 * Resolved at call time: a value import of "electron" cannot even be loaded
 * outside Electron, which is where this module's tests run.
 */
function getElectronWebContents() {
  const { webContents } = require("electron") as typeof import("electron");

  return webContents.getAllWebContents();
}

function subscribeToElectronWebContentsCreated(listener: (contents: WebContents) => void) {
  const { app } = require("electron") as typeof import("electron");

  const handleCreated = (_event: ElectronEvent, contents: WebContents) => {
    listener(contents);
  };

  app.on("web-contents-created", handleCreated);

  return () => {
    app.off("web-contents-created", handleCreated);
  };
}

/**
 * A frame an Electron load event names by process and routing id. The main
 * frame is asked for directly, since its ids change with every cross-process
 * navigation while it stays frame 0.
 */
export function findEventFrame(
  contents: WebContents,
  isMainFrame: boolean,
  processId: number,
  routingId: number,
): WebFrameMain | undefined {
  if (isMainFrame) {
    return contents.mainFrame;
  }

  // Destroyed first, a disposed frame throwing from every other accessor
  return contents.mainFrame.framesInSubtree.find(
    (frame) =>
      !frame.isDestroyed() && frame.processId === processId && frame.routingId === routingId,
  );
}

/**
 * Chrome's details for one event in one frame. `url` is the frame's own unless
 * the event names another, which `onBeforeNavigate` does: the frame still
 * holds the document it is leaving.
 */
export function describeNavigationEvent(
  type: WebNavigationEventName,
  tabId: number,
  frame: WebFrameMain,
  { url = frame.url, timeStamp }: { url?: string; timeStamp: number },
): WebNavigationEventDetails {
  const isSubframe = frame.parent !== null;

  return {
    tabId,
    url,
    processId: type === "onBeforeNavigate" ? -1 : frame.processId,
    frameId: getExtensionFrameId(frame),
    parentFrameId: frame.parent ? getExtensionFrameId(frame.parent) : -1,
    timeStamp,
    frameType: isSubframe ? "sub_frame" : "outermost_frame",
    documentLifecycle: "active",
    ...(type === "onCommitted"
      ? { transitionType: isSubframe ? "auto_subframe" : "link", transitionQualifiers: [] }
      : {}),
  };
}

/**
 * `chrome.webNavigation`'s `onBeforeNavigate`, `onCommitted`,
 * `onDOMContentLoaded` and `onCompleted`, synthesized from the pages' own load
 * events for the extensions an embedder opted in. Electron dispatches none of
 * them, and a password manager's worker waits on `onCompleted` before it
 * offers to save a login whose next page was still loading.
 *
 * Delivered over a stream each listening context parks, in the shape alarms
 * use, and only for the pages that context may resolve a tab of — its own
 * session's, and those `canResolveTabAcrossSessions` lets it reach.
 *
 * The pages are listened to only while a stream is parked, which the facade
 * does only while one of its events has a listener: every navigation of every
 * page would otherwise pay for an extension that never asked.
 *
 * `onDOMContentLoaded` fires for main frames only, Electron reporting
 * `dom-ready` for no other frame.
 */
export class NavigationEvents {
  private deliversNavigationEvents: NavigationEventsPolicy | undefined;

  private canResolveTabAcrossSessions: (askingSession: Session, tabSession: Session) => boolean;

  private getAllWebContents: () => WebContents[];

  private onWebContentsCreated: (listener: (contents: WebContents) => void) => () => void;

  private now: () => number;

  private logger: ExtensionsLogger | undefined;

  private streams = new Set<ParkedStream>();

  /** Every page listened to, with what takes its listeners off again. */
  private watchedContents = new Map<WebContents, () => void>();

  private stopWatchingCreated: (() => void) | undefined;

  constructor({
    deliversNavigationEvents,
    canResolveTabAcrossSessions,
    getAllWebContents = getElectronWebContents,
    onWebContentsCreated = subscribeToElectronWebContentsCreated,
    now = Date.now,
    logger,
  }: NavigationEventsOptions = {}) {
    this.deliversNavigationEvents = deliversNavigationEvents;

    this.canResolveTabAcrossSessions = canResolveTabAcrossSessions ?? (() => false);

    this.getAllWebContents = getAllWebContents;

    this.onWebContentsCreated = onWebContentsCreated;

    this.now = now;

    this.logger = logger;
  }

  registerRoutes(bridge: ExtensionBridge) {
    bridge.handle(WEB_NAVIGATION_PATHS.events, ({ session, extensionId, headers }) =>
      this.handleEvents(session, extensionId, headers),
    );
  }

  /** Whether a page is watched, for tests and the embedder's own diagnostics. */
  isWatching(contents: WebContents) {
    return this.watchedContents.has(contents);
  }

  private handleEvents(session: Session, extensionId: string, headers: Record<string, string>) {
    if (this.deliversNavigationEvents?.(extensionId) !== true) {
      return new Response(null, { status: 403, headers });
    }

    let parked: ParkedStream | undefined;

    const body = new ReadableStream<Uint8Array>({
      start: (controller) => {
        parked = { session, extensionId, controller };

        this.streams.add(parked);

        this.watch();
      },
      cancel: () => {
        if (parked) {
          this.dropStream(parked);
        }
      },
    });

    return new Response(body, {
      headers: { ...headers, "content-type": "application/octet-stream" },
    });
  }

  private dropStream(parked: ParkedStream) {
    this.streams.delete(parked);

    if (this.streams.size === 0) {
      this.unwatch();
    }
  }

  private canReach(askingSession: Session, tabSession: Session) {
    return (
      askingSession === tabSession || this.canResolveTabAcrossSessions(askingSession, tabSession)
    );
  }

  private isReachable(tabSession: Session) {
    for (const parked of this.streams) {
      if (this.canReach(parked.session, tabSession)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Attaches to every page some parked stream reaches, and to every page
   * created from now on. Asked again for each stream parked, since a stream
   * from another session reaches pages the first did not.
   */
  private watch() {
    if (!this.stopWatchingCreated) {
      this.stopWatchingCreated = this.onWebContentsCreated((contents) => {
        this.attach(contents);
      });

      this.logger?.info("Started delivering navigation events", {});
    }

    for (const contents of this.getAllWebContents()) {
      this.attach(contents);
    }
  }

  private unwatch() {
    this.stopWatchingCreated?.();

    this.stopWatchingCreated = undefined;

    for (const detach of this.watchedContents.values()) {
      detach();
    }

    this.watchedContents.clear();

    this.logger?.info("Stopped delivering navigation events", {});
  }

  private attach(contents: WebContents) {
    if (
      contents.isDestroyed() ||
      this.watchedContents.has(contents) ||
      !this.isReachable(contents.session)
    ) {
      return;
    }

    const handleStartNavigation = (
      details: ElectronEvent<{
        url: string;
        isSameDocument: boolean;
        frame: WebFrameMain | null;
      }>,
    ) => {
      // A same-document navigation is `onReferenceFragmentUpdated` or
      // `onHistoryStateUpdated` in Chrome, never `onBeforeNavigate`
      if (details.isSameDocument || !details.frame || details.frame.isDestroyed()) {
        return;
      }

      this.emit(contents, "onBeforeNavigate", details.frame, details.url);
    };

    const handleFrameNavigate = (
      _event: ElectronEvent,
      url: string,
      _httpResponseCode: number,
      _httpStatusText: string,
      isMainFrame: boolean,
      frameProcessId: number,
      frameRoutingId: number,
    ) => {
      const frame = findEventFrame(contents, isMainFrame, frameProcessId, frameRoutingId);

      if (frame) {
        this.emit(contents, "onCommitted", frame, url);
      }
    };

    const handleDomReady = () => {
      this.emit(contents, "onDOMContentLoaded", contents.mainFrame);
    };

    const handleFrameFinishLoad = (
      _event: ElectronEvent,
      isMainFrame: boolean,
      frameProcessId: number,
      frameRoutingId: number,
    ) => {
      const frame = findEventFrame(contents, isMainFrame, frameProcessId, frameRoutingId);

      if (frame) {
        this.emit(contents, "onCompleted", frame);
      }
    };

    const handleDestroyed = () => {
      this.watchedContents.delete(contents);
    };

    contents.on("did-start-navigation", handleStartNavigation);
    contents.on("did-frame-navigate", handleFrameNavigate);
    contents.on("dom-ready", handleDomReady);
    contents.on("did-frame-finish-load", handleFrameFinishLoad);
    contents.once("destroyed", handleDestroyed);

    this.watchedContents.set(contents, () => {
      if (contents.isDestroyed()) {
        return;
      }

      contents.off("did-start-navigation", handleStartNavigation);
      contents.off("did-frame-navigate", handleFrameNavigate);
      contents.off("dom-ready", handleDomReady);
      contents.off("did-frame-finish-load", handleFrameFinishLoad);
      contents.off("destroyed", handleDestroyed);
    });
  }

  private emit(
    contents: WebContents,
    type: WebNavigationEventName,
    frame: WebFrameMain,
    url?: string,
  ) {
    if (contents.isDestroyed() || frame.isDestroyed()) {
      return;
    }

    const tabSession = contents.session;

    const frameBytes = encodeNativeMessage({
      type,
      details: describeNavigationEvent(type, contents.id, frame, { url, timeStamp: this.now() }),
    } satisfies WebNavigationEventFrame);

    for (const parked of this.streams) {
      if (!this.canReach(parked.session, tabSession)) {
        continue;
      }

      try {
        parked.controller.enqueue(frameBytes);
      } catch {
        // A stream whose context went away without canceling
        this.dropStream(parked);
      }
    }
  }
}
