/**
 * What `chrome.webNavigation` frame queries say over the extension bridge
 * (`bridge/protocol.ts`), shared by the facade and the main process.
 */

export const WEB_NAVIGATION_PATHS = {
  getFrame: "/web-navigation/get-frame",
  getAllFrames: "/web-navigation/get-all-frames",
  events: "/web-navigation/events",
} as const;

/**
 * Set in the facade of an extension whose contexts hear the `webNavigation`
 * events main synthesizes (`web-navigation/navigation-events.ts`), Electron
 * dispatching none. Without it the events stay the facade's noops.
 */
export const DELIVERS_NAVIGATION_EVENTS_GLOBAL = "__meruDeliversNavigationEvents";

/** The events main synthesizes, each named as on `chrome.webNavigation`. */
export type WebNavigationEventName =
  | "onBeforeNavigate"
  | "onCommitted"
  | "onDOMContentLoaded"
  | "onCompleted";

/**
 * Chrome's event details, without `documentId` and `parentDocumentId` for the
 * reason `WebNavigationFrameDetails` gives. `processId` is -1 before a
 * navigation commits, as in Chrome, where the process is not settled yet.
 */
export type WebNavigationEventDetails = {
  tabId: number;
  url: string;
  processId: number;
  frameId: number;
  parentFrameId: number;
  timeStamp: number;
  frameType: "outermost_frame" | "sub_frame";
  documentLifecycle: "active";
  /**
   * `onCommitted` only. Electron reports no transition, so this is what Chrome
   * answers for a link in a main frame and for any subframe's own load.
   */
  transitionType?: "link" | "auto_subframe";
  transitionQualifiers?: string[];
};

/**
 * Frames on the events response body, in the length-prefixed framing alarms
 * use (`alarms/bridge-protocol.ts`).
 */
export type WebNavigationEventFrame = {
  type: WebNavigationEventName;
  details: WebNavigationEventDetails;
};

/** What the extension handed to `getFrame`/`getAllFrames`, taken as untrusted. */
export type WebNavigationFrameQuery = {
  tabId?: unknown;
  frameId?: unknown;
};

/**
 * Chrome's frame details, minus `documentId`: Chromium mints those per document
 * inside its extensions layer and Electron exposes nothing equivalent, and a
 * made-up value would defeat exactly the caching and dedup extensions use the
 * id for.
 */
export type WebNavigationFrameDetails = {
  frameId: number;
  parentFrameId: number;
  processId: number;
  url: string;
  errorOccurred: boolean;
  frameType: "outermost_frame" | "sub_frame";
  documentLifecycle: "active";
};
