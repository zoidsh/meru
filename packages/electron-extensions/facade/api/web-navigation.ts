import { WEB_NAVIGATION_PATHS } from "../../web-navigation/bridge-protocol";
import { postBridge } from "../lib/bridge";
import type { ChromeNamespace } from "../lib/chrome";
import { createNoopEvent } from "../lib/event";
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

/**
 * The frame queries are real (`web-navigation/web-navigation.ts`); the events
 * still never fire. 1Password registers four of them at boot but its fill flow
 * asks `getFrame` live, which is the part autofill hangs on.
 */
export function createWebNavigation(): ChromeNamespace {
  return {
    getFrame: createFrameQuery(WEB_NAVIGATION_PATHS.getFrame),
    getAllFrames: createFrameQuery(WEB_NAVIGATION_PATHS.getAllFrames),

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
