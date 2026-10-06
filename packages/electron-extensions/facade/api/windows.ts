import { WINDOWS_PATHS } from "../../windows/bridge-protocol";
import { postBridge } from "../lib/bridge";
import type { ChromeNamespace } from "../lib/chrome";
import { createNoopEvent } from "../lib/event";
import { createBridgedMethod, createNoopMethod } from "../lib/method";

/**
 * The one window every query answers with. An embedder promoting this namespace
 * maps it onto its own windows; until then extensions only need a stable id
 * that is neither `WINDOW_ID_NONE` nor `WINDOW_ID_CURRENT`.
 */
const WINDOW_ID = 1;

function createWindow() {
  return {
    id: WINDOW_ID,
    focused: true,
    incognito: false,
    alwaysOnTop: false,
    state: "normal",
    type: "normal",
    top: 0,
    left: 0,
    width: 1280,
    height: 800,
    tabs: [],
  };
}

export function createWindows(): ChromeNamespace {
  return {
    WINDOW_ID_NONE: -1,
    WINDOW_ID_CURRENT: -2,

    get: createNoopMethod(createWindow),
    getCurrent: createNoopMethod(createWindow),
    getLastFocused: createNoopMethod(createWindow),
    getAll: createNoopMethod(() => [createWindow()]),
    // SPIKE: promoted, since Bitwarden's sign-in and unlock surfaces are
    // `windows.create` popouts of its own pages and a noop leaves it no way in.
    // A window the embedder declines still answers the fake one, which is the
    // noop's behavior and what every other method here keeps
    create: createBridgedMethod(async (callArguments) => {
      try {
        const response = await postBridge(WINDOWS_PATHS.create, {
          createData: callArguments[0],
        });

        if (!response.ok) {
          return createWindow();
        }

        return (await response.json()) ?? createWindow();
      } catch {
        return createWindow();
      }
    }),
    update: createNoopMethod(createWindow),
    remove: createBridgedMethod(async (callArguments) => {
      try {
        await postBridge(WINDOWS_PATHS.remove, { windowId: callArguments[0] });
      } catch {
        // Chrome resolves `remove` with nothing, so a bridge that cannot be
        // reached is a window that stays open rather than an error
      }

      return undefined;
    }),

    onCreated: createNoopEvent(),
    onRemoved: createNoopEvent(),
    onFocusChanged: createNoopEvent(),
    onBoundsChanged: createNoopEvent(),
  };
}
