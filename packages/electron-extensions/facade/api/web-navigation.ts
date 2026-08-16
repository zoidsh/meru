import type { ChromeNamespace } from "../lib/chrome";
import { createNoopEvent } from "../lib/event";
import { createNoopMethod } from "../lib/method";

export function createWebNavigation(): ChromeNamespace {
  return {
    // Chrome answers `null` for a frame it cannot find, and extensions handle it
    getFrame: createNoopMethod(() => null),
    getAllFrames: createNoopMethod(() => []),

    onBeforeNavigate: createNoopEvent(),
    onCommitted: createNoopEvent(),
    onDOMContentLoaded: createNoopEvent(),
    onCompleted: createNoopEvent(),
    onErrorOccurred: createNoopEvent(),
    onCreatedNavigationTarget: createNoopEvent(),
    onReferenceFragmentUpdated: createNoopEvent(),
    onTabReplaced: createNoopEvent(),
    onHistoryStateUpdated: createNoopEvent(),
  };
}
