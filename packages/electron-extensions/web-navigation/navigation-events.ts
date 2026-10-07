import type { Event as ElectronEvent, Session, WebContents, WebFrameMain } from "electron";
import type { ExtensionBridge } from "../bridge/bridge";
import type { ExtensionsLogger } from "../logger";
import { encodeNativeMessage } from "../native-messaging/framing";
import {
  WEB_NAVIGATION_PATHS,
  type WebNavigationEventDetails,
  type WebNavigationEventFrame,
  type WebNavigationEventName,
  type WebNavigationListenedEvents,
  type WebNavigationListenersBody,
} from "./bridge-protocol";
import { matchesEventFilters } from "./url-filter";
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
  streamId: string;
  sequence: number;
  listened: WebNavigationListenedEvents;
  controller: ReadableStreamDefaultController<Uint8Array>;
};

/**
 * How many frames a stream may hold unread before it is taken for a context
 * that died without canceling. A live context drains its stream as frames
 * arrive; Electron's own pipe to it sits in front of this queue and absorbs
 * any burst a busy context lets build up.
 */
const MAX_UNREAD_FRAMES = 64;

/** The page event each synthesized event is read from. */
const PAGE_EVENTS: Record<WebNavigationEventName, string> = {
  onBeforeNavigate: "did-start-navigation",
  onCommitted: "did-frame-navigate",
  onDOMContentLoaded: "dom-ready",
  onCompleted: "did-frame-finish-load",
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

/** What a context said it listens to, taken as untrusted. */
function readListened(listened: unknown): WebNavigationListenedEvents {
  const read: WebNavigationListenedEvents = {};

  if (typeof listened !== "object" || listened === null) {
    return read;
  }

  for (const eventName of Object.keys(PAGE_EVENTS) as WebNavigationEventName[]) {
    const filters = (listened as Record<string, unknown>)[eventName];

    if (filters === null) {
      read[eventName] = null;
    } else if (Array.isArray(filters)) {
      read[eventName] = filters.filter(
        (filter): filter is Record<string, unknown> =>
          typeof filter === "object" && filter !== null,
      );
    }
  }

  return read;
}

/**
 * Whether a stream hears an event for this URL: it listens to the event, and
 * its listeners' merged filters match, `null` matching every URL.
 */
function streamHears(parked: ParkedStream, type: WebNavigationEventName, url: string) {
  const filters = parked.listened[type];

  if (filters === undefined) {
    return false;
  }

  // An empty list can only be filters that were all dropped as malformed,
  // which match nothing, whereas Chrome reads an empty `url` as every URL
  return filters === null || (filters.length > 0 && matchesEventFilters(url, { url: filters }));
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
 * Each stream says which events its context listens to and with which url
 * filters (`WebNavigationListenersBody`). Pages are listened to only for the
 * events some parked stream wants, and only a frame some stream's filters
 * match is serialized at all. A context can listen for its whole life —
 * Bitwarden's badge keeps an unfiltered `onCommitted` — so that is what keeps
 * the cost to the events it asked for rather than every event of every frame.
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

  /** The events some parked stream listens to, which the pages are listened to for. */
  private attachedEvents = new Set<WebNavigationEventName>();

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
    bridge.handle(WEB_NAVIGATION_PATHS.events, ({ session, extensionId, body, headers }) =>
      this.handleEvents(session, extensionId, body, headers),
    );

    bridge.handle(WEB_NAVIGATION_PATHS.listeners, ({ session, extensionId, body, headers }) => {
      this.updateListeners(session, extensionId, body);

      return Response.json(null, { headers });
    });
  }

  /** Whether a page is listened to for an event, for tests and the embedder's own diagnostics. */
  isWatching(contents: WebContents, type?: WebNavigationEventName) {
    return (
      this.watchedContents.has(contents) && (type === undefined || this.attachedEvents.has(type))
    );
  }

  private handleEvents(
    session: Session,
    extensionId: string,
    body: Record<string, unknown>,
    headers: Record<string, string>,
  ) {
    if (this.deliversNavigationEvents?.(extensionId) !== true) {
      return new Response(null, { status: 403, headers });
    }

    let parked: ParkedStream | undefined;

    const readable = new ReadableStream<Uint8Array>({
      start: (controller) => {
        parked = {
          session,
          extensionId,
          streamId: typeof body.streamId === "string" ? body.streamId : "",
          sequence: typeof body.sequence === "number" ? body.sequence : 0,
          listened: readListened(body.listened),
          controller,
        };

        this.streams.add(parked);

        this.refresh();
      },
      cancel: () => {
        if (parked) {
          this.dropStream(parked);
        }
      },
    });

    return new Response(readable, {
      headers: { ...headers, "content-type": "application/octet-stream" },
    });
  }

  /**
   * A context's listeners changed. Only its own stream, by the id it parked
   * with, and only an update newer than what the stream already holds.
   */
  private updateListeners(session: Session, extensionId: string, body: Record<string, unknown>) {
    const { streamId, sequence } = body as Partial<WebNavigationListenersBody>;

    if (typeof streamId !== "string" || typeof sequence !== "number") {
      return;
    }

    for (const parked of this.streams) {
      if (
        parked.streamId === streamId &&
        parked.extensionId === extensionId &&
        parked.session === session &&
        sequence > parked.sequence
      ) {
        parked.sequence = sequence;

        parked.listened = readListened(body.listened);

        this.refresh();
      }
    }
  }

  private dropStream(parked: ParkedStream) {
    if (this.streams.delete(parked)) {
      this.refresh();
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
   * Brings the pages' listeners in line with what the parked streams want:
   * none at all when nothing listens, and otherwise every reachable page,
   * attached for the events some stream listens to. A page attached for a set
   * that has since changed is attached again.
   */
  private refresh() {
    const wantedEvents = new Set<WebNavigationEventName>();

    for (const parked of this.streams) {
      for (const eventName of Object.keys(parked.listened) as WebNavigationEventName[]) {
        wantedEvents.add(eventName);
      }
    }

    if (wantedEvents.size === 0) {
      this.unwatch();

      return;
    }

    const eventsChanged =
      wantedEvents.size !== this.attachedEvents.size ||
      [...wantedEvents].some((eventName) => !this.attachedEvents.has(eventName));

    if (eventsChanged) {
      this.detachAll();

      this.attachedEvents = wantedEvents;
    }

    if (!this.stopWatchingCreated) {
      this.stopWatchingCreated = this.onWebContentsCreated((contents) => {
        this.attach(contents);
      });

      this.logger?.info("Started delivering navigation events", {});
    }

    // Again for every stream parked, since one from another session reaches
    // pages the others did not
    for (const contents of this.getAllWebContents()) {
      this.attach(contents);
    }
  }

  private unwatch() {
    if (!this.stopWatchingCreated) {
      return;
    }

    this.stopWatchingCreated();

    this.stopWatchingCreated = undefined;

    this.detachAll();

    this.attachedEvents = new Set();

    this.logger?.info("Stopped delivering navigation events", {});
  }

  private detachAll() {
    for (const detach of this.watchedContents.values()) {
      detach();
    }

    this.watchedContents.clear();
  }

  private attach(contents: WebContents) {
    if (
      contents.isDestroyed() ||
      this.watchedContents.has(contents) ||
      !this.isReachable(contents.session)
    ) {
      return;
    }

    const handlers: Record<string, (...eventArguments: never[]) => void> = {
      [PAGE_EVENTS.onBeforeNavigate]: (
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
      },
      [PAGE_EVENTS.onCommitted]: (
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
      },
      [PAGE_EVENTS.onDOMContentLoaded]: () => {
        this.emit(contents, "onDOMContentLoaded", contents.mainFrame);
      },
      [PAGE_EVENTS.onCompleted]: (
        _event: ElectronEvent,
        isMainFrame: boolean,
        frameProcessId: number,
        frameRoutingId: number,
      ) => {
        const frame = findEventFrame(contents, isMainFrame, frameProcessId, frameRoutingId);

        if (frame) {
          this.emit(contents, "onCompleted", frame);
        }
      },
    };

    const pageEvents = [...this.attachedEvents].map((eventName) => PAGE_EVENTS[eventName]);

    const emitter = contents as unknown as {
      on: (eventName: string, listener: (...eventArguments: never[]) => void) => void;
      off: (eventName: string, listener: (...eventArguments: never[]) => void) => void;
    };

    for (const pageEvent of pageEvents) {
      emitter.on(pageEvent, handlers[pageEvent] as (...eventArguments: never[]) => void);
    }

    const handleDestroyed = () => {
      this.watchedContents.delete(contents);
    };

    contents.once("destroyed", handleDestroyed);

    this.watchedContents.set(contents, () => {
      if (contents.isDestroyed()) {
        return;
      }

      for (const pageEvent of pageEvents) {
        emitter.off(pageEvent, handlers[pageEvent] as (...eventArguments: never[]) => void);
      }

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

    const eventUrl = url ?? frame.url;

    let frameBytes: Uint8Array | undefined;

    for (const parked of this.streams) {
      if (!this.canReach(parked.session, tabSession) || !streamHears(parked, type, eventUrl)) {
        continue;
      }

      // `enqueue` throws only once a stream is canceled or closed, and a
      // context that goes without canceling leaves one that buffers forever
      const { desiredSize } = parked.controller;

      if (desiredSize !== null && desiredSize < -MAX_UNREAD_FRAMES) {
        parked.controller.error(new Error("The context stopped reading its navigation events"));

        this.logger?.info("Dropped a navigation event stream nothing reads", {
          extensionId: parked.extensionId,
        });

        this.dropStream(parked);

        continue;
      }

      frameBytes ??= encodeNativeMessage({
        type,
        details: describeNavigationEvent(type, contents.id, frame, {
          url: eventUrl,
          timeStamp: this.now(),
        }),
      } satisfies WebNavigationEventFrame);

      try {
        parked.controller.enqueue(frameBytes);
      } catch {
        // A stream whose context went away without canceling
        this.dropStream(parked);
      }
    }
  }
}
