/**
 * What `chrome.webNavigation` frame queries say over the extension bridge
 * (`bridge/protocol.ts`), shared by the facade and the main process.
 */

export const WEB_NAVIGATION_PATHS = {
  getFrame: "/web-navigation/get-frame",
  getAllFrames: "/web-navigation/get-all-frames",
} as const;

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
