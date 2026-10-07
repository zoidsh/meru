import {
  WEB_NAVIGATION_PATHS,
  type WebNavigationEventFrame,
  type WebNavigationEventName,
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
];

/**
 * The four events main synthesizes (`web-navigation/navigation-events.ts`),
 * sharing one stream. The stream is parked by the first listener of any of
 * them and let go when the last is removed, since main listens to every page
 * the context reaches for as long as one is parked. Each listener keeps the
 * url filters it was added with, and hears only the events they match.
 */
function createDeliveredEvents(): Record<WebNavigationEventName, ChromeEvent> {
  const listenersByEvent = new Map<WebNavigationEventName, Map<ChromeEventListener, unknown>>(
    DELIVERED_EVENT_NAMES.map((eventName) => [eventName, new Map()]),
  );

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
    { label: "webNavigation" },
  );

  const hasAnyListener = () =>
    [...listenersByEvent.values()].some((listeners) => listeners.size > 0);

  const createDeliveredEvent = (eventName: WebNavigationEventName): ChromeEvent => {
    const listeners = listenersByEvent.get(eventName) as Map<ChromeEventListener, unknown>;

    return {
      addListener(listener, filters) {
        listeners.set(listener, filters);

        void listen();
      },
      removeListener(listener) {
        listeners.delete(listener);

        if (!hasAnyListener()) {
          listen.stop();
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
 * never fire, except `onBeforeNavigate`, `onCommitted`, `onDOMContentLoaded`
 * and `onCompleted` in an extension the embedder delivers them to
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
      };

  return {
    getFrame: createFrameQuery(WEB_NAVIGATION_PATHS.getFrame),
    getAllFrames: createFrameQuery(WEB_NAVIGATION_PATHS.getAllFrames),

    ...deliveredEvents,
    onErrorOccurred: createNoopEvent(),
    onCreatedNavigationTarget: createNoopEvent(),
    onReferenceFragmentUpdated: createNoopEvent(),
    onTabReplaced: createNoopEvent(),
    onHistoryStateUpdated: createNoopEvent(),
  };
}
