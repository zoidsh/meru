import {
  WEB_NAVIGATION_PATHS,
  type WebNavigationEventFrame,
  type WebNavigationEventName,
  type WebNavigationListenedEvents,
  type WebNavigationListenersBody,
} from "../../web-navigation/bridge-protocol";
import { matchesEventFilters } from "../../web-navigation/url-filter";
import { postBridge } from "../lib/bridge";
import type { ChromeEvent, ChromeEventListener, ChromeNamespace } from "../lib/chrome";
import { createNoopEvent } from "../lib/event";
import { createEventStream } from "../lib/event-stream";
import { createBridgedMethod } from "../lib/method";

/**
 * A frame query answered by the main process, since only it holds the session's
 * frame tree. `null` is Chrome's own answer for a frame or tab it cannot find,
 * and extensions handle it — so it also stands in when the bridge cannot be
 * reached.
 */
function createFrameQuery(pathName: string) {
  return createBridgedMethod(async (callArguments) => {
    try {
      const response = await postBridge(pathName, { details: callArguments[0] });

      if (!response.ok) {
        return null;
      }

      return await response.json();
    } catch {
      return null;
    }
  });
}

const DELIVERED_EVENT_NAMES: WebNavigationEventName[] = [
  "onBeforeNavigate",
  "onCommitted",
  "onDOMContentLoaded",
  "onCompleted",
  "onErrorOccurred",
];

/**
 * The url filters an event's listeners were added with, merged: `null` where
 * any listener has none, since that listener hears every URL.
 */
function mergeListenerFilters(listeners: Map<ChromeEventListener, unknown>) {
  const merged: Record<string, unknown>[] = [];

  for (const filters of listeners.values()) {
    const urlFilters = (filters as { url?: unknown } | undefined)?.url;

    if (!Array.isArray(urlFilters) || urlFilters.length === 0) {
      return null;
    }

    for (const urlFilter of urlFilters) {
      if (typeof urlFilter === "object" && urlFilter !== null) {
        merged.push(urlFilter as Record<string, unknown>);
      }
    }
  }

  return merged;
}

/**
 * The events main synthesizes (`web-navigation/navigation-events.ts`), sharing
 * one stream. The stream is parked by the first listener of any of them and let
 * go when the last is removed.
 *
 * Main is told which events have listeners, with their merged url filters, as
 * the stream is parked and again whenever they change. It then listens to pages
 * for those events alone and sends only what some listener here would hear: an
 * extension can hold one listener for its worker's whole life — Bitwarden's
 * badge keeps an unfiltered `onCommitted` — and without this every event of
 * every frame would cross the bridge only to be dropped here. Each listener
 * still keeps its own filters.
 */
function createDeliveredEvents(): Record<WebNavigationEventName, ChromeEvent> {
  const listenersByEvent = new Map<WebNavigationEventName, Map<ChromeEventListener, unknown>>(
    DELIVERED_EVENT_NAMES.map((eventName) => [eventName, new Map()]),
  );

  const streamId = crypto.randomUUID();

  let sequence = 0;

  let isConnected = false;

  /** Counts connections, so an update's answer can tell whether a park came since. */
  let connections = 0;

  /**
   * What the stream main holds was parked with. Updates sent while the park was
   * in flight can reach main before the stream does and be answered 404, so
   * this, not the last update, is what main is known to hold on connecting.
   */
  let parkedListened = "";

  let shouldResendOnConnect = false;

  const describeListened = () => {
    const listened: WebNavigationListenedEvents = {};

    for (const [eventName, listeners] of listenersByEvent) {
      if (listeners.size > 0) {
        listened[eventName] = mergeListenerFilters(listeners);
      }
    }

    return listened;
  };

  const createBody = (): WebNavigationListenersBody => {
    sequence += 1;

    return { streamId, sequence, listened: describeListened() };
  };

  const createParkBody = () => {
    const body = createBody();

    parkedListened = JSON.stringify(body.listened);

    return body;
  };

  const sendListeners = async () => {
    const connectionsAtSend = connections;

    try {
      const response = await postBridge(WEB_NAVIGATION_PATHS.listeners, createBody());

      // Main holds no stream by this id: it dropped the stream, or the park
      // has not reached it yet. Either way the update is lost, and the next
      // connection has to carry it — or this one, if it connected meanwhile
      if (response.status === 404) {
        if (isConnected && connections !== connectionsAtSend) {
          void sendListeners();
        } else {
          shouldResendOnConnect = true;
        }
      }
    } catch {
      // The bridge going away is the stream going away, and the re-park
      // carries the listeners as they are then
    }
  };

  const listen = createEventStream<WebNavigationEventFrame>(
    WEB_NAVIGATION_PATHS.events,
    ({ type, details }) => {
      const listeners = listenersByEvent.get(type);

      if (!listeners || typeof details?.url !== "string") {
        return;
      }

      for (const [listener, filters] of listeners) {
        if (!matchesEventFilters(details.url, filters)) {
          continue;
        }

        try {
          listener(details);
        } catch (error) {
          console.error("[chrome-facade] event listener threw", error);
        }
      }
    },
    {
      label: "webNavigation",
      getBody: createParkBody,
      onConnected: () => {
        isConnected = true;

        connections += 1;

        if (shouldResendOnConnect || JSON.stringify(describeListened()) !== parkedListened) {
          shouldResendOnConnect = false;

          void sendListeners();
        }
      },
      onDisconnected: () => {
        isConnected = false;
      },
    },
  );

  const hasAnyListener = () =>
    [...listenersByEvent.values()].some((listeners) => listeners.size > 0);

  const handleListenersChanged = () => {
    if (!hasAnyListener()) {
      isConnected = false;

      listen.stop();

      return;
    }

    if (isConnected) {
      void sendListeners();
    } else {
      void listen();
    }
  };

  const createDeliveredEvent = (eventName: WebNavigationEventName): ChromeEvent => {
    const listeners = listenersByEvent.get(eventName) as Map<ChromeEventListener, unknown>;

    return {
      addListener(listener, filters) {
        listeners.set(listener, filters);

        handleListenersChanged();
      },
      removeListener(listener) {
        if (listeners.delete(listener)) {
          handleListenersChanged();
        }
      },
      hasListener: (listener) => listeners.has(listener),
      hasListeners: () => listeners.size > 0,
    };
  };

  return Object.fromEntries(
    DELIVERED_EVENT_NAMES.map((eventName) => [eventName, createDeliveredEvent(eventName)]),
  ) as Record<WebNavigationEventName, ChromeEvent>;
}

/**
 * The frame queries are real (`web-navigation/web-navigation.ts`). The events
 * never fire, except `onBeforeNavigate`, `onCommitted`, `onDOMContentLoaded`,
 * `onCompleted` and `onErrorOccurred` in an extension the embedder delivers them to
 * (`DELIVERS_NAVIGATION_EVENTS_GLOBAL`): Bitwarden's worker waits on
 * `onCompleted` before offering to save a login whose next page is still
 * loading. 1Password registers four of them at boot, but its fill flow asks
 * `getFrame` live, which is the part autofill hangs on.
 */
export function createWebNavigation({ deliversNavigationEvents = false } = {}): ChromeNamespace {
  const deliveredEvents = deliversNavigationEvents
    ? createDeliveredEvents()
    : {
        onBeforeNavigate: createNoopEvent(),
        onCommitted: createNoopEvent(),
        onDOMContentLoaded: createNoopEvent(),
        onCompleted: createNoopEvent(),
        onErrorOccurred: createNoopEvent(),
      };

  return {
    getFrame: createFrameQuery(WEB_NAVIGATION_PATHS.getFrame),
    getAllFrames: createFrameQuery(WEB_NAVIGATION_PATHS.getAllFrames),

    ...deliveredEvents,
    onCreatedNavigationTarget: createNoopEvent(),
    onReferenceFragmentUpdated: createNoopEvent(),
    onTabReplaced: createNoopEvent(),
    onHistoryStateUpdated: createNoopEvent(),
  };
}
