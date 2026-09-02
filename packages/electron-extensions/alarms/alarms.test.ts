import { beforeEach, describe, expect, test } from "bun:test";
import type { OnBeforeSendHeadersListenerDetails, Session, WebFrameMain } from "electron";
import { ExtensionBridge } from "../bridge/bridge";
import { getExtensionBridgeUrl } from "../bridge/protocol";
import { NativeMessageDecoder } from "../native-messaging/framing";
import { Alarms } from "./alarms";
import { ALARMS_PATHS, type AlarmDetails, type AlarmFrame } from "./bridge-protocol";

const EXTENSION_ID = "aeblfdkhhhdcdjpifhhbdiojplfjncoa";

const BRIDGE_TOKEN = "bridge-token";

type BeforeSendHeadersListener = (
  details: OnBeforeSendHeadersListenerDetails,
  callback: (response: { requestHeaders?: Record<string, string> }) => void,
) => void;

let requestHandler: ((request: GlobalRequest) => Promise<Response>) | undefined;

let beforeSendHeadersListener: BeforeSendHeadersListener | null = null;

let startedWorkerScopes: string[];

let session: Session;

/** A page's frame, which is what tells a page's stream from the worker's. */
function createFrame(): WebFrameMain {
  return {
    url: `chrome-extension://${EXTENSION_ID}/popup.html`,
    parent: null,
    frameToken: "frame-token",
    isDestroyed: () => false,
  } as unknown as WebFrameMain;
}

beforeEach(() => {
  requestHandler = undefined;

  beforeSendHeadersListener = null;

  startedWorkerScopes = [];

  session = {
    protocol: {
      handle: (_scheme: string, handler: (request: GlobalRequest) => Promise<Response>) => {
        requestHandler = handler;
      },
      unhandle: () => {
        requestHandler = undefined;
      },
    },
    webRequest: {
      onBeforeSendHeaders: (filter: unknown, listener?: BeforeSendHeadersListener | null) => {
        beforeSendHeadersListener = listener ?? (filter as BeforeSendHeadersListener | null);
      },
    },
    serviceWorkers: {
      startWorkerForScope: async (scope: string) => {
        startedWorkerScopes.push(scope);
      },
    },
  } as unknown as Session;
});

function setup(alarms: Alarms) {
  const bridge = new ExtensionBridge();

  alarms.registerRoutes(bridge);

  bridge.setupSession(session, {
    getExtensionId: (bridgeToken) => (bridgeToken === BRIDGE_TOKEN ? EXTENSION_ID : undefined),
  });
}

/**
 * A bridge call as the facade makes it. Without a frame the request reaches the
 * handler unstamped, which is exactly what a service worker's request looks
 * like — the `webRequest` listener a page's request passes through is one a
 * worker never reaches.
 */
function send(pathName: string, body: Record<string, unknown> = {}, frame?: WebFrameMain) {
  const url = getExtensionBridgeUrl(pathName, BRIDGE_TOKEN);

  let requestHeaders: Record<string, string> = {};

  if (frame) {
    beforeSendHeadersListener?.(
      { url, frame, requestHeaders } as OnBeforeSendHeadersListenerDetails,
      ({ requestHeaders: stampedHeaders }) => {
        requestHeaders = stampedHeaders ?? requestHeaders;
      },
    );
  }

  return requestHandler?.(
    new Request(url, { method: "POST", headers: requestHeaders, body: JSON.stringify(body) }),
  ) as Promise<Response>;
}

/** Parks an events stream and reads the alarms as they arrive. */
async function park(frame?: WebFrameMain) {
  const response = await send(ALARMS_PATHS.events, {}, frame);

  const reader = (response.body as ReadableStream<Uint8Array>).getReader();

  const decoder = new NativeMessageDecoder();

  const delivered: AlarmDetails[] = [];

  const read = async () => {
    for (;;) {
      const { value, done } = await reader.read();

      if (done) {
        return;
      }

      for (const frameRead of decoder.push(value) as AlarmFrame[]) {
        delivered.push(frameRead.alarm);
      }
    }
  };

  void read();

  return {
    delivered,
    cancel: () => reader.cancel(),
  };
}

/** Lets the timers a due alarm rides on run, and the stream reads behind them. */
function settle() {
  return new Promise((resolve) => {
    setTimeout(resolve, 20);
  });
}

async function readJson(response: Promise<Response>) {
  return (await response).json();
}

describe("Alarms", () => {
  test("creates an alarm and reads it back", async () => {
    setup(new Alarms());

    await send(ALARMS_PATHS.create, { name: "watchtower", alarmInfo: { delayInMinutes: 60 } });

    const alarm = (await readJson(send(ALARMS_PATHS.get, { name: "watchtower" }))) as AlarmDetails;

    expect(alarm.name).toBe("watchtower");
    expect(alarm.scheduledTime).toBeGreaterThan(Date.now());
    expect(await readJson(send(ALARMS_PATHS.getAll))).toBeArrayOfSize(1);
  });

  test("answers null for an alarm that is not there", async () => {
    setup(new Alarms());

    expect(await readJson(send(ALARMS_PATHS.get, { name: "missing" }))).toBeNull();
    expect(await readJson(send(ALARMS_PATHS.getAll))).toEqual([]);
  });

  test("takes a create with no name as the alarm named empty", async () => {
    setup(new Alarms());

    await send(ALARMS_PATHS.create, { alarmInfo: { delayInMinutes: 60 } });

    const alarm = (await readJson(send(ALARMS_PATHS.get, {}))) as AlarmDetails;

    expect(alarm.name).toBe("");
  });

  test("refuses a create that names no time at all", async () => {
    setup(new Alarms());

    expect((await send(ALARMS_PATHS.create, { name: "empty", alarmInfo: {} })).status).toBe(400);
    expect(await readJson(send(ALARMS_PATHS.getAll))).toEqual([]);
  });

  test("refuses a name long enough to make its own deliveries unreadable", async () => {
    setup(new Alarms());

    const longName = "a".repeat(513);

    expect(
      (await send(ALARMS_PATHS.create, { name: longName, alarmInfo: { delayInMinutes: 1 } }))
        .status,
    ).toBe(400);
    expect(await readJson(send(ALARMS_PATHS.getAll))).toEqual([]);
  });

  test("refuses a delay large enough to overflow the time it is due", async () => {
    setup(new Alarms());

    const status = (
      await send(ALARMS_PATHS.create, { name: "overflow", alarmInfo: { delayInMinutes: 1e305 } })
    ).status;

    expect(status).toBe(400);
    expect(await readJson(send(ALARMS_PATHS.getAll))).toEqual([]);
  });

  test("caps how many alarms one extension may hold, and still replaces its own", async () => {
    setup(new Alarms());

    for (let index = 0; index < 500; index += 1) {
      await send(ALARMS_PATHS.create, { name: `poll-${index}`, alarmInfo: { delayInMinutes: 60 } });
    }

    expect(
      (await send(ALARMS_PATHS.create, { name: "one-too-many", alarmInfo: { delayInMinutes: 60 } }))
        .status,
    ).toBe(400);

    // Replacing an alarm it already holds keeps working at the cap
    expect(
      (await send(ALARMS_PATHS.create, { name: "poll-0", alarmInfo: { delayInMinutes: 120 } }))
        .status,
    ).toBe(204);
    expect(await readJson(send(ALARMS_PATHS.getAll))).toBeArrayOfSize(500);
  });

  test("replaces an alarm created again under the same name", async () => {
    setup(new Alarms());

    await send(ALARMS_PATHS.create, { name: "poll", alarmInfo: { delayInMinutes: 60 } });
    await send(ALARMS_PATHS.create, { name: "poll", alarmInfo: { delayInMinutes: 120 } });

    const alarms = (await readJson(send(ALARMS_PATHS.getAll))) as AlarmDetails[];

    expect(alarms).toBeArrayOfSize(1);
    expect(alarms[0]?.scheduledTime).toBeGreaterThan(Date.now() + 90 * 60_000);
  });

  test("clears one alarm and says whether there was one", async () => {
    setup(new Alarms());

    await send(ALARMS_PATHS.create, { name: "poll", alarmInfo: { delayInMinutes: 60 } });

    expect(await readJson(send(ALARMS_PATHS.clear, { name: "poll" }))).toBe(true);
    expect(await readJson(send(ALARMS_PATHS.clear, { name: "poll" }))).toBe(false);
  });

  test("clears every alarm and answers true either way", async () => {
    setup(new Alarms());

    await send(ALARMS_PATHS.create, { name: "poll", alarmInfo: { delayInMinutes: 60 } });

    expect(await readJson(send(ALARMS_PATHS.clearAll))).toBe(true);
    expect(await readJson(send(ALARMS_PATHS.getAll))).toEqual([]);
    expect(await readJson(send(ALARMS_PATHS.clearAll))).toBe(true);
  });

  test("delivers a due alarm to the worker's parked stream", async () => {
    setup(new Alarms());

    const workerStream = await park();

    await send(ALARMS_PATHS.create, { name: "lockMonitor", alarmInfo: { when: Date.now() - 1 } });

    await settle();

    expect(workerStream.delivered).toEqual([
      { name: "lockMonitor", scheduledTime: expect.any(Number) },
    ]);
  });

  test("delivers to an extension page alongside the worker", async () => {
    setup(new Alarms());

    const workerStream = await park();

    const pageStream = await park(createFrame());

    await send(ALARMS_PATHS.create, { name: "poll", alarmInfo: { when: Date.now() - 1 } });

    await settle();

    expect(workerStream.delivered).toBeArrayOfSize(1);
    expect(pageStream.delivered).toBeArrayOfSize(1);
  });

  test("clears a one-shot alarm once it has fired and keeps a periodic one", async () => {
    setup(new Alarms());

    await park();

    const firedAt = Date.now() - 1;

    await send(ALARMS_PATHS.create, { name: "once", alarmInfo: { when: firedAt } });
    await send(ALARMS_PATHS.create, {
      name: "repeating",
      alarmInfo: { when: firedAt, periodInMinutes: 1 },
    });

    await settle();

    const alarms = (await readJson(send(ALARMS_PATHS.getAll))) as AlarmDetails[];

    expect(alarms.map(({ name }) => name)).toEqual(["repeating"]);
    // Advanced by a period from when it was due, rather than left where it was
    expect(alarms[0]?.scheduledTime).toBe(firedAt + 60_000);
  });

  test("hands a periodic alarm's listener the time it was due", async () => {
    setup(new Alarms());

    const workerStream = await park();

    const dueAt = Date.now() - 1;

    await send(ALARMS_PATHS.create, {
      name: "keepalive",
      alarmInfo: { when: dueAt, periodInMinutes: 1 },
    });

    await settle();

    expect(workerStream.delivered).toEqual([
      { name: "keepalive", scheduledTime: dueAt, periodInMinutes: 1 },
    ]);
  });

  test("drops an alarm with no worker parked, and wakes nothing", async () => {
    setup(new Alarms());

    await send(ALARMS_PATHS.create, { name: "poll", alarmInfo: { when: Date.now() - 1 } });

    await settle();

    expect(startedWorkerScopes).toEqual([]);

    // Nothing was queued for the worker that starts afterwards
    const workerStream = await park();

    await settle();

    expect(workerStream.delivered).toEqual([]);
  });

  test("does not count an extension page as a worker to deliver to", async () => {
    setup(new Alarms({ shouldWakeWorker: () => true }));

    await park(createFrame());

    await send(ALARMS_PATHS.create, { name: "poll", alarmInfo: { when: Date.now() - 1 } });

    await settle();

    expect(startedWorkerScopes).toEqual([`chrome-extension://${EXTENSION_ID}/`]);
  });

  test("wakes a stopped worker and delivers what came due while it started", async () => {
    setup(new Alarms({ shouldWakeWorker: () => true }));

    await send(ALARMS_PATHS.create, { name: "lockMonitor", alarmInfo: { when: Date.now() - 1 } });

    await settle();

    expect(startedWorkerScopes).toEqual([`chrome-extension://${EXTENSION_ID}/`]);

    const workerStream = await park();

    await settle();

    expect(workerStream.delivered.map(({ name }) => name)).toEqual(["lockMonitor"]);
  });

  test("drops what a woken worker never came back for", async () => {
    setup(new Alarms({ shouldWakeWorker: () => true, wakeTimeoutMs: 10 }));

    await send(ALARMS_PATHS.create, { name: "poll", alarmInfo: { when: Date.now() - 1 } });

    await settle();

    const workerStream = await park();

    await settle();

    expect(workerStream.delivered).toEqual([]);
  });

  test("stops delivering to a stream its context canceled", async () => {
    setup(new Alarms());

    const workerStream = await park();

    await workerStream.cancel();

    await send(ALARMS_PATHS.create, { name: "poll", alarmInfo: { when: Date.now() - 1 } });

    await settle();

    expect(workerStream.delivered).toEqual([]);
  });

  test("forgets a session's alarms when it is torn down", async () => {
    const alarms = new Alarms();

    setup(alarms);

    await send(ALARMS_PATHS.create, { name: "poll", alarmInfo: { delayInMinutes: 60 } });

    alarms.teardownSession(session);

    setup(alarms);

    expect(await readJson(send(ALARMS_PATHS.getAll))).toEqual([]);
  });
});
