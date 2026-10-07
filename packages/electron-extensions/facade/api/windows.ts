import {
  MAIN_WINDOW_ID,
  WINDOWS_PATHS,
  type WindowsEventFrame,
  type WindowsWindowResponse,
} from "../../windows/bridge-protocol";
import { postBridge } from "../lib/bridge";
import type { ChromeEventListener, ChromeNamespace } from "../lib/chrome";
import { createEvent, createNoopEvent } from "../lib/event";
import { createEventStream } from "../lib/event-stream";
import { createBridgedMethod, createNoopMethod } from "../lib/method";

/**
 * The one window every query the embedder does not serve answers with. An
 * extension only needs a stable id that is neither `WINDOW_ID_NONE` nor
 * `WINDOW_ID_CURRENT`; the ids the main process hands out for windows it really
 * opened start past it (`windows/windows.ts`). It is also the `windowId` of
 * every tab not in one of those (`runtime-proxy/worker-tabs.ts`).
 */
const WINDOW_ID = MAIN_WINDOW_ID;

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

/**
 * What the main process says about a window (`windows/windows.ts`), or nothing
 * when it cannot be asked. A bridge that will not answer is read as an embedder
 * that serves no windows, which is the noop this namespace has always been.
 */
async function postWindows(pathName: string, body: Record<string, unknown>) {
  try {
    const response = await postBridge(pathName, body);

    if (!response.ok) {
      return undefined;
    }

    return ((await response.json()) as WindowsWindowResponse | null) ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * `onRemoved`, fired for the windows main opened for the extension when they
 * close, however they close. The stream it rides is parked by the first
 * listener, so a context that never listens never opens one.
 *
 * Chrome fires it for every window, and nothing here is a window an extension
 * could tell apart but these. It is what a password manager's worker ends a
 * request on when the user closes the popout it opened for it: Bitwarden's
 * passkey request otherwise waits out the page's own timeout, two minutes on
 * the page it was measured on.
 */
function createRemovedEvent() {
  const { emit, addListener, ...removedEvent } = createEvent();

  const listen = createEventStream<WindowsEventFrame>(
    WINDOWS_PATHS.events,
    (frame) => {
      if (frame.type === "removed") {
        emit(frame.windowId);
      }
    },
    { label: "windows" },
  );

  return {
    ...removedEvent,
    addListener(listener: ChromeEventListener, ...eventOptions: unknown[]) {
      addListener(listener, ...eventOptions);

      void listen();
    },
  };
}

/** Whether this context is a page, the one kind that is inside a window. */
function isPageContext() {
  return (globalThis as unknown as Record<string, unknown>).document !== undefined;
}

/**
 * `chrome.windows`, with the three methods the main process can answer for a
 * window it opened itself — the extension's own page in a window of the
 * embedder's, for the extensions the embedder opted in.
 *
 * Everything else stays the fake window, and so does every one of these for an
 * extension that was not opted in: the namespace is a view of a browser Meru is
 * not, and an extension that reads `getCurrent` at startup only needs an answer
 * to carry on with. `create` is the exception that earns the bridge call, a
 * password manager's unlock and sign-in surfaces being popouts of its own pages
 * — see `windows/windows.ts` for why the opt-in is what makes that safe.
 *
 * `getCurrent` is answered without asking in a service worker, which has no
 * window of its own and is where an extension reads it at boot: the bridge
 * would answer the same fake window a round trip later.
 *
 * `onRemoved` fires only for an extension the embedder opens windows for,
 * `opensExtensionWindows`, there being no window another extension could hear
 * about.
 */
export function createWindows({ opensExtensionWindows = false } = {}): ChromeNamespace {
  return {
    WINDOW_ID_NONE: -1,
    WINDOW_ID_CURRENT: -2,

    get: createBridgedMethod(async (callArguments) => {
      const answer = await postWindows(WINDOWS_PATHS.get, { windowId: callArguments[0] });

      return answer?.window ?? createWindow();
    }),

    getCurrent: createBridgedMethod(async () => {
      if (!isPageContext()) {
        return createWindow();
      }

      // No id, so the main process answers with the window the calling frame is
      // the page of — which is how a popout closing itself finds its own id
      const answer = await postWindows(WINDOWS_PATHS.get, {});

      return answer?.window ?? createWindow();
    }),

    getLastFocused: createNoopMethod(createWindow),
    getAll: createNoopMethod(() => [createWindow()]),

    create: createBridgedMethod(async (callArguments) => {
      const answer = await postWindows(WINDOWS_PATHS.create, { createData: callArguments[0] });

      // A URL the embedder refuses — anything but the extension's own pages —
      // is the call failing, which is what Chrome does with one it will not
      // open, rather than a window the extension would then wait on
      if (answer?.error) {
        throw new Error(answer.error);
      }

      return answer?.window ?? createWindow();
    }),

    update: createNoopMethod(createWindow),

    remove: createBridgedMethod(async (callArguments) => {
      // Chrome resolves `remove` with nothing, so a bridge that cannot be
      // reached is a window that stays open rather than an error
      await postWindows(WINDOWS_PATHS.remove, { windowId: callArguments[0] });

      return undefined;
    }),

    onCreated: createNoopEvent(),
    onRemoved: opensExtensionWindows ? createRemovedEvent() : createNoopEvent(),
    onFocusChanged: createNoopEvent(),
    onBoundsChanged: createNoopEvent(),
  };
}
