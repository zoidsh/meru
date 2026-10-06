import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { ALARMS_PATHS, type AlarmDetails, type AlarmFrame } from "../../alarms/bridge-protocol";
import { encodeNativeMessage } from "../../native-messaging/framing";
import type { ChromeEvent, ChromeNamespace } from "../lib/chrome";
import { createAlarms, installAlarms } from "./alarms";

type BridgeRequest = { path: string; body: Record<string, unknown> };

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

/**
 * The main-process end of the bridge, with the events stream left open so the
 * test can push alarms down it the way a due alarm does.
 */
function installFakeBridge() {
  const requests: BridgeRequest[] = [];

  const answers = new Map<string, unknown>();

  const refusals = new Map<string, number>();

  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;

  let canceledStreamCount = 0;

  let markParked = () => {};

  const parked = new Promise<void>((resolve) => {
    markParked = resolve;
  });

  globalThis.fetch = (async (url: string, init: RequestInit) => {
    const { pathname: path } = new URL(url);

    requests.push({ path, body: JSON.parse(init.body as string) });

    const refusalStatus = refusals.get(path);

    if (refusalStatus !== undefined) {
      return new Response(null, { status: refusalStatus });
    }

    if (path !== ALARMS_PATHS.events) {
      return answers.has(path)
        ? Response.json(answers.get(path))
        : new Response(null, { status: 204 });
    }

    const body = new ReadableStream<Uint8Array>({
      start: (streamController) => {
        controller = streamController;

        markParked();
      },
      cancel: () => {
        canceledStreamCount += 1;
      },
    });

    return new Response(body);
  }) as unknown as typeof fetch;

  return {
    requests,
    paths: () => requests.map(({ path }) => path),
    parked,
    answer: (path: string, result: unknown) => {
      answers.set(path, result);
    },
    refuse: (path: string, status: number) => {
      refusals.set(path, status);
    },
    fire: (alarm: AlarmDetails) => {
      controller?.enqueue(encodeNativeMessage({ type: "alarm", alarm } satisfies AlarmFrame));
    },
    /** A frame announcing more bytes than the decoder will ever buffer. */
    breakStream: () => {
      const oversizedFrame = new Uint8Array(4);

      new DataView(oversizedFrame.buffer).setUint32(0, 2 ** 30, true);

      controller?.enqueue(oversizedFrame);
    },
    canceledStreamCount: () => canceledStreamCount,
  };
}

function methodOf(alarms: ChromeNamespace, name: string) {
  return alarms[name] as (...callArguments: unknown[]) => Promise<unknown>;
}

function eventOf(alarms: ChromeNamespace, name: string) {
  return alarms[name] as ChromeEvent;
}

/** Lets the bridge calls and the stream reads behind a listener settle. */
function settle() {
  return new Promise((resolve) => {
    setTimeout(resolve, 10);
  });
}

describe("installAlarms", () => {
  test("replaces the alarms Electron implements", () => {
    const nativeAlarms = { create: () => {} };

    const extensionApi: ChromeNamespace = { alarms: nativeAlarms };

    const alarms = createAlarms();

    installAlarms(extensionApi, alarms);

    expect(extensionApi.alarms).toBe(alarms);
  });

  test("adds no alarms to a context Chromium gives none", () => {
    // A content script, which has no alarms in Chrome either
    const extensionApi: ChromeNamespace = { runtime: {} };

    installAlarms(extensionApi, createAlarms());

    expect(extensionApi.alarms).toBeUndefined();
  });
});

describe("alarms", () => {
  test("creates an alarm over the bridge", async () => {
    const bridge = installFakeBridge();

    await methodOf(createAlarms(), "create")("lockMonitor", { periodInMinutes: 1 });

    expect(bridge.requests).toEqual([
      {
        path: ALARMS_PATHS.create,
        body: { name: "lockMonitor", alarmInfo: { periodInMinutes: 1 } },
      },
    ]);
  });

  test("takes a create with no name as the alarm named empty", async () => {
    const bridge = installFakeBridge();

    await methodOf(createAlarms(), "create")({ delayInMinutes: 1 });

    expect(bridge.requests[0]?.body).toEqual({ name: "", alarmInfo: { delayInMinutes: 1 } });
  });

  test("takes an explicit undefined name as the alarm named empty", async () => {
    const bridge = installFakeBridge();

    // What a wrapper forwarding an optional name passes; reading the first
    // argument alone drops the alarmInfo and the alarm with it
    await methodOf(createAlarms(), "create")(undefined, { delayInMinutes: 1 });

    expect(bridge.requests[0]?.body).toEqual({ name: "", alarmInfo: { delayInMinutes: 1 } });
  });

  test("parks one replacement stream when a frame is too large to decode", async () => {
    const bridge = installFakeBridge();

    const alarms = createAlarms();

    eventOf(alarms, "onAlarm").addListener(() => {});

    await bridge.parked;

    const error = spyOn(console, "error").mockImplementation(() => {});

    try {
      bridge.breakStream();

      await settle();

      // The refused frame must take its stream with it: a reader left open
      // leaves main writing to a stream nothing reads while the retry parks
      // another
      expect(bridge.canceledStreamCount()).toBe(1);
    } finally {
      error.mockRestore();
    }
  });

  test("warns in the extension's own console about a period it will not get", async () => {
    installFakeBridge();

    const warn = spyOn(console, "warn").mockImplementation(() => {});

    try {
      await methodOf(createAlarms(), "create")("poll", { periodInMinutes: 0.1 });

      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0]?.[0]).toContain("poll");
    } finally {
      warn.mockRestore();
    }
  });

  test("warns once per alarm name, however often the extension recreates it", async () => {
    installFakeBridge();

    const warn = spyOn(console, "warn").mockImplementation(() => {});

    try {
      const alarms = createAlarms();

      const create = methodOf(alarms, "create");

      await create("poll", { periodInMinutes: 0.1 });
      await create("poll", { periodInMinutes: 0.1 });
      await create("poll", { periodInMinutes: 0.2 });

      expect(warn).toHaveBeenCalledTimes(1);

      await create("sync", { delayInMinutes: 0.1 });

      expect(warn).toHaveBeenCalledTimes(2);
      expect(warn.mock.calls[1]?.[0]).toContain("sync");
    } finally {
      warn.mockRestore();
    }
  });

  test("reads an alarm back, and undefined for one that is not there", async () => {
    const bridge = installFakeBridge();

    const alarm: AlarmDetails = { name: "poll", scheduledTime: 1, periodInMinutes: 1 };

    bridge.answer(ALARMS_PATHS.get, alarm);
    bridge.answer(ALARMS_PATHS.getAll, [alarm]);

    expect(await methodOf(createAlarms(), "get")("poll")).toEqual(alarm);
    expect(await methodOf(createAlarms(), "getAll")()).toEqual([alarm]);

    bridge.answer(ALARMS_PATHS.get, null);

    expect(await methodOf(createAlarms(), "get")("missing")).toBeUndefined();
  });

  test("answers a callback call instead of returning a promise", async () => {
    const bridge = installFakeBridge();

    bridge.answer(ALARMS_PATHS.clear, true);

    const { promise, resolve } = Promise.withResolvers<unknown>();

    const returnValue = methodOf(createAlarms(), "clear")("poll", resolve);

    expect(returnValue).toBeUndefined();
    expect(await promise).toBe(true);
  });

  test("answers Chrome's own empty result when the bridge refuses", async () => {
    const bridge = installFakeBridge();

    for (const path of [ALARMS_PATHS.get, ALARMS_PATHS.getAll, ALARMS_PATHS.clear]) {
      bridge.refuse(path, 403);
    }

    const alarms = createAlarms();

    // Never a rejection: Chrome's alarms have no failure of their own to report
    expect(await methodOf(alarms, "get")("poll")).toBeUndefined();
    expect(await methodOf(alarms, "getAll")()).toEqual([]);
    expect(await methodOf(alarms, "clear")("poll")).toBe(false);
  });

  test("parks no stream until something listens", async () => {
    const bridge = installFakeBridge();

    await methodOf(createAlarms(), "create")("poll", { periodInMinutes: 1 });

    expect(bridge.paths()).not.toContain(ALARMS_PATHS.events);
  });

  test("delivers a fired alarm to every listener", async () => {
    const bridge = installFakeBridge();

    const alarms = createAlarms();

    const delivered: unknown[] = [];

    eventOf(alarms, "onAlarm").addListener((alarm) => {
      delivered.push(alarm);
    });

    eventOf(alarms, "onAlarm").addListener((alarm) => {
      delivered.push(alarm);
    });

    await bridge.parked;

    const alarm: AlarmDetails = { name: "lockMonitor", scheduledTime: 1, periodInMinutes: 1 };

    bridge.fire(alarm);

    await settle();

    expect(delivered).toEqual([alarm, alarm]);
  });

  test("parks one stream however many listeners are added", async () => {
    const bridge = installFakeBridge();

    const alarms = createAlarms();

    eventOf(alarms, "onAlarm").addListener(() => {});
    eventOf(alarms, "onAlarm").addListener(() => {});

    await bridge.parked;

    await settle();

    expect(bridge.paths().filter((path) => path === ALARMS_PATHS.events)).toBeArrayOfSize(1);
  });

  test("keeps a removed listener from hearing anything", async () => {
    const bridge = installFakeBridge();

    const alarms = createAlarms();

    let firedCount = 0;

    const listener = () => {
      firedCount += 1;
    };

    eventOf(alarms, "onAlarm").addListener(listener);

    await bridge.parked;

    expect(eventOf(alarms, "onAlarm").hasListener(listener)).toBe(true);

    eventOf(alarms, "onAlarm").removeListener(listener);

    bridge.fire({ name: "poll", scheduledTime: 1 });

    await settle();

    expect(firedCount).toBe(0);
    expect(eventOf(alarms, "onAlarm").hasListeners()).toBe(false);
  });
});
