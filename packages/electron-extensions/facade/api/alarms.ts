import {
  ALARMS_PATHS,
  type AlarmCreateInfo,
  type AlarmDetails,
  type AlarmFrame,
} from "../../alarms/bridge-protocol";
import { getAlarmClampWarning } from "../../alarms/schedule";
import { NativeMessageDecoder } from "../../native-messaging/framing";
import { postBridge } from "../lib/bridge";
import type { ChromeEventListener, ChromeNamespace } from "../lib/chrome";
import { createEvent } from "../lib/event";
import { defineMember, readMember } from "../lib/fill";
import { createBridgedMethod } from "../lib/method";

/** How long a dropped events stream waits before it is parked again. */
const RETRY_DELAY_MS = 1000;

function delay(delayMs: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

/**
 * Chrome takes `create(alarmInfo)` as well as `create(name, alarmInfo)`, and an
 * alarm made without a name is the alarm named `""`.
 *
 * An explicit `undefined` or `null` where the name goes is Chrome leaving the
 * parameter out rather than passing it, so `create(undefined, alarmInfo)` is
 * the alarm named `""` — not, as reading the first argument alone would have
 * it, a create carrying no `alarmInfo` at all. A wrapper forwarding an optional
 * name is how an extension gets there.
 */
function parseCreateArguments(callArguments: unknown[]) {
  const [firstArgument, secondArgument] = callArguments;

  const hasName = typeof firstArgument === "string";

  return {
    name: hasName ? firstArgument : "",
    alarmInfo: (hasName || secondArgument !== undefined ? secondArgument : firstArgument) as
      | AlarmCreateInfo
      | undefined,
  };
}

function readName(callArguments: unknown[]) {
  const [name] = callArguments;

  return typeof name === "string" ? name : "";
}

/**
 * A call the main process answers, with the answer Chrome gives for "nothing
 * there" standing in whenever the bridge cannot be reached — `undefined` for a
 * `get`, an empty list for a `getAll`, `false` for a `clear`.
 *
 * Chrome's alarms have no failure of their own to report and no `lastError` on
 * any of these, so a bridge that is gone is told as an empty answer rather than
 * as a rejection the extension has no handler for.
 */
function createAlarmQuery<QueryResult>(pathName: string, emptyResult: QueryResult) {
  return createBridgedMethod(async (callArguments) => {
    try {
      const response = await postBridge(pathName, { name: readName(callArguments) });

      if (!response.ok) {
        return emptyResult;
      }

      const result = (await response.json()) as QueryResult | null;

      // JSON carries no `undefined`, so a missing alarm arrives as `null`
      return result ?? emptyResult;
    } catch {
      return emptyResult;
    }
  });
}

/**
 * `chrome.alarms`, scheduled in the main process and delivered over the
 * extension bridge (`alarms/alarms.ts`).
 *
 * Electron's own alarms are replaced rather than filled in around, because they
 * are half working in a way that filling cannot reach: Chromium schedules them
 * and fires them, and dispatches `onAlarm` into extension pages but never into
 * an extension service worker, which is where MV3 puts every background handler
 * (measured 2 September 2026 on Electron 43.2.0). An extension whose alarms all
 * live in the worker — 1Password's seven do — has a namespace that answers
 * every call and never fires.
 *
 * The events stream is parked by the first `onAlarm` listener rather than at
 * startup, so a context that never listens never opens one.
 */
export function createAlarms(): ChromeNamespace {
  const { emit: emitAlarm, addListener: addAlarmListener, ...alarmEvent } = createEvent();

  let isListening = false;

  /**
   * Reads the parked stream until it ends, which is what a torn-down session
   * and a refused request both look like from here. Ending is not the same as
   * being done: the context is still live and still holds listeners, so the
   * stream is parked again behind a delay for as long as the context lasts.
   */
  const readAlarmStream = async () => {
    const response = await postBridge(ALARMS_PATHS.events, {});

    if (!response.ok || !response.body) {
      throw new Error(`The alarms bridge answered ${response.status}`);
    }

    const reader = response.body.getReader();

    const decoder = new NativeMessageDecoder();

    // A frame the decoder refuses throws out of the loop, and a reader left
    // open then means main keeps this stream in its delivery set and writes to
    // it forever while the retry parks another one
    try {
      for (;;) {
        const { value, done } = await reader.read();

        if (done) {
          return;
        }

        for (const frame of decoder.push(value) as AlarmFrame[]) {
          if (frame.type === "alarm") {
            emitAlarm(frame.alarm satisfies AlarmDetails);
          }
        }
      }
    } finally {
      await reader.cancel().catch(() => undefined);
    }
  };

  const listenForAlarms = async () => {
    if (isListening) {
      return;
    }

    isListening = true;

    for (;;) {
      try {
        await readAlarmStream();
      } catch (error) {
        console.error("[chrome-facade] alarms stream failed", error);
      }

      await delay(RETRY_DELAY_MS);
    }
  };

  return {
    create: createBridgedMethod(async (callArguments) => {
      const { name, alarmInfo } = parseCreateArguments(callArguments);

      const clampWarning = getAlarmClampWarning(name, alarmInfo);

      if (clampWarning) {
        console.warn(`[chrome-facade] ${clampWarning}`);
      }

      try {
        await postBridge(ALARMS_PATHS.create, { name, alarmInfo });
      } catch {
        // Chrome's `create` reports nothing and answers nothing
      }

      return undefined;
    }),

    get: createAlarmQuery<AlarmDetails | undefined>(ALARMS_PATHS.get, undefined),
    getAll: createAlarmQuery<AlarmDetails[]>(ALARMS_PATHS.getAll, []),
    clear: createAlarmQuery<boolean>(ALARMS_PATHS.clear, false),
    clearAll: createAlarmQuery<boolean>(ALARMS_PATHS.clearAll, false),

    onAlarm: {
      ...alarmEvent,
      addListener(listener: ChromeEventListener, ...eventOptions: unknown[]) {
        addAlarmListener(listener, ...eventOptions);

        void listenForAlarms();
      },
    },
  };
}

/**
 * Replaces Electron's `alarms` with the facade's, in every context that has one
 * — the service worker, where delivery is broken, and extension pages, where it
 * works. Both, because one store is the whole point: an alarm the worker
 * created has to be what a page's `getAll` sees and what its `clear` clears,
 * and Electron's alarms live in Chromium's own store where nothing here can
 * reach them.
 *
 * A context Chromium gives no `alarms` at all keeps none. That is what tells a
 * content script apart from a privileged context, and Chrome exposes no alarms
 * to a content script either.
 */
export function installAlarms(extensionApi: ChromeNamespace, alarms: ChromeNamespace) {
  if (readMember(extensionApi, "alarms") === undefined) {
    return;
  }

  defineMember(extensionApi, "alarms", alarms);
}
