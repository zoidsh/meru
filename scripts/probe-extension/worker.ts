import {
  callMember,
  listen,
  PROBE_LAUNCH,
  PROBE_ORIGIN,
  probeChrome as chrome,
  report,
  reportEvent,
  takeInventory,
  type WebRequestDetails,
} from "./chrome";
import {
  ALARM_DELAY_SECONDS,
  PAGE_PATH,
  type Settled,
  WORKER_CALLS,
  WORKER_FETCH_PATH,
} from "./protocol";

// Every listener goes on at top level, before the worker does anything that
// could fire it, which is what MV3 asks of a background handler
listen("worker", "runtime.onInstalled", chrome.runtime.onInstalled, ({ reason }) => ({ reason }));

listen("worker", "storage.onChanged", chrome.storage?.onChanged, (changes, areaName) => ({
  areaName,
  keys: Object.keys(changes),
}));

listen("worker", "storage.local.onChanged", chrome.storage?.local?.onChanged, (changes) => ({
  keys: Object.keys(changes),
}));

listen("worker", "alarms.onAlarm", chrome.alarms?.onAlarm, ({ name }) => ({ name }));

const describeRequest = ({ url, type, tabId }: WebRequestDetails) => ({
  path: new URL(url).pathname,
  type,
  tabId,
});

// Only the two requests under test: reporting a request is itself a request
const requestFilter = {
  urls: [`${PROBE_ORIGIN}${PAGE_PATH}`, `${PROBE_ORIGIN}${WORKER_FETCH_PATH}`],
};

listen(
  "worker",
  "webRequest.onBeforeRequest",
  chrome.webRequest?.onBeforeRequest,
  describeRequest,
  requestFilter,
);

listen(
  "worker",
  "webRequest.onCompleted",
  chrome.webRequest?.onCompleted,
  describeRequest,
  requestFilter,
);

// A page's message is what starts a worker that nothing else would, on a
// launch where the extension is already installed
chrome.runtime.onMessage.addListener((_message, _sender, sendResponse) => {
  sendResponse({ launch: PROBE_LAUNCH });

  return false;
});

async function settle<T>(call: () => Promise<T> | undefined): Promise<Settled<T>> {
  try {
    return { value: await call() };
  } catch (error) {
    return { error: String(error) };
  }
}

const sleep = (milliseconds: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

async function setUp() {
  const alarms = chrome.alarms;
  const scripting = chrome.scripting;

  void (async () => {
    await sleep(1500);
    await reportEvent(
      "worker",
      "storage.write",
      await settle(() => chrome.storage?.local?.set({ first: 1 })),
    );
    await sleep(2500);
    await reportEvent(
      "worker",
      "storage.write",
      await settle(() => chrome.storage?.local?.set({ second: 2 })),
    );
  })();

  await reportEvent(
    "worker",
    "alarms.create",
    await settle(() => alarms?.create("probe", { delayInMinutes: ALARM_DELAY_SECONDS / 60 })),
  );

  await settle(() => alarms?.create("persist", { delayInMinutes: 60 }));

  await reportEvent(
    "worker",
    "scripting.register",
    await settle(async () => {
      await scripting?.registerContentScripts([
        {
          id: "dynamic",
          js: ["dynamic.js"],
          matches: [`${PROBE_ORIGIN}/*`],
          runAt: "document_start",
          persistAcrossSessions: true,
        },
      ]);

      return scripting?.getRegisteredContentScripts();
    }),
  );

  await settle(() => fetch(`${PROBE_ORIGIN}${WORKER_FETCH_PATH}`));

  for (const { member, args } of WORKER_CALLS) {
    await reportEvent("worker", "call", {
      member,
      args: args.map((arg) => JSON.stringify(arg)),
      ...(await callMember(member, args)),
    });
  }
}

async function boot() {
  // Read before anything is registered, so a second launch sees only what the
  // first one left
  await report("/boot", {
    launch: PROBE_LAUNCH,
    registeredScripts: await settle(() => chrome.scripting?.getRegisteredContentScripts()),
    persistAlarm: await settle(() => chrome.alarms?.get("persist")),
  });

  await report("/inventory", { context: "worker", inventory: takeInventory() });

  if (PROBE_LAUNCH === 1) {
    await setUp();
  }
}

void boot();

// A native extension call resets the worker's idle timer, so a silence is
// never the worker having stopped
setInterval(() => {
  void chrome.storage?.local?.get("keepalive");
}, 10_000);
