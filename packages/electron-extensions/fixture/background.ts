/**
 * The fixture extension's service worker: the receiving end every probe
 * context messages, deliberately free of any behavior beyond answering.
 *
 * Everything it answers carries `workerInstanceId`, a value minted once per
 * worker instance. Two contexts whose replies carry the same id were served
 * by the same worker instance — which is the shared-instance claim: a
 * content-script-only session's messages land on the one worker another
 * session keeps, not on a worker of its own.
 *
 * The worker also stamps its instance id into `chrome.storage`, in `local`
 * where every context may read it and in `session` where Chrome's default lets
 * only the extension's own documents. A context that reads either stamp back
 * is reading the one store this session keeps, since nothing writes it in the
 * other sessions at all. It writes again on request, so a context can hear the
 * `onChanged` a write in this session fires in its own.
 *
 * Worker lifetime is deliberately not probed, here or in the tests. The
 * end-to-end suite launches through Playwright, whose CDP debugger disables
 * Chromium's MV3 idle timer, so from that suite a worker reads as
 * permanently alive whether it is or not — a test about the worker stopping
 * would pass or fail with confidence and mean nothing. That also makes
 * `workerInstanceId` and `portEvents` stable for a test's lifetime; without
 * the debugger they would reset whenever the worker idled out.
 */
import {
  type FixtureMessageSender,
  getChromeRuntime,
  getChromeStorage,
  getChromeTabs,
  getChromeWebNavigation,
} from "./chrome";

const workerGlobals = globalThis as unknown as {
  crypto: { randomUUID: () => string };
  fetch: (url: string, init: { method: string; mode: string; body: string }) => Promise<unknown>;
};

const workerInstanceId = workerGlobals.crypto.randomUUID();

/**
 * Port connects and disconnects, in the order the worker saw them. A context
 * that closed its own port cannot observe the worker noticing, so it asks for
 * this log over `sendMessage` instead.
 */
const portEvents: string[] = [];

/**
 * The sender flattened to one comparable shape. `hasTab` is its own field
 * because the claim "an extension page's message carries no tab" is about the
 * key being absent, which a null `tabId` alone would blur.
 */
function serializeSender(sender: FixtureMessageSender | undefined) {
  return {
    url: sender?.url ?? null,
    origin: sender?.origin ?? null,
    frameId: sender?.frameId ?? null,
    hasTab: sender?.tab !== undefined,
    tabId: sender?.tab?.id ?? null,
    tabUrl: sender?.tab?.url ?? null,
  };
}

type ProbeMessage = {
  type?: string;
  nonce?: string;
  key?: string;
  value?: unknown;
  url?: string;
};

/**
 * How a call the worker made ended, in the shape the probes record their own
 * outcomes in: a reply, or the `lastError` Chrome set instead of one.
 */
type WorkerCallOutcome =
  | { status: "replied"; reply: unknown }
  | { status: "error"; message: string };

/** One tab of the worker's `tabs.query`, flattened to what a test compares on. */
type SeenTab = {
  id: number | null;
  url: string | null;
  active: boolean | null;
};

const storage = getChromeStorage();

/** The stamps, written once at boot, that the probes read back. */
storage.local.set({ workerStamp: workerInstanceId }, () => {});

storage.session.set({ workerSessionStamp: workerInstanceId }, () => {});

const runtime = getChromeRuntime();

const tabs = getChromeTabs();

const webNavigation = getChromeWebNavigation();

/**
 * Sends back into the tab the message came from, which is the whole
 * worker-to-page direction: in a shimmed session that tab is in another
 * session entirely, where the worker's own `chrome.tabs` reaches nothing.
 * The frame is named too, since a sign-in page's form is rarely its main one.
 */
function sendToSender(
  sender: FixtureMessageSender | undefined,
  message: unknown,
  answer: (outcome: WorkerCallOutcome) => void,
) {
  const tabId = sender?.tab?.id;

  if (tabId === undefined) {
    answer({ status: "error", message: "The sender carried no tab" });

    return;
  }

  tabs.sendMessage(tabId, message, { frameId: sender?.frameId }, (reply) => {
    const lastError = runtime.lastError;

    answer(
      lastError
        ? { status: "error", message: lastError.message ?? "unknown" }
        : { status: "replied", reply },
    );
  });
}

/**
 * Every tab the worker can see, and the one the message came from asked for by
 * id — the two calls a lock broadcast starts with. Natively both are scoped to
 * the worker's own session, which holds no account's tabs, so in a shimmed
 * session an unrelayed `query` lists nothing and an unrelayed `get` answers
 * with `lastError`.
 */
function describeTabs(
  sender: FixtureMessageSender | undefined,
  answer: (tabs: SeenTab[], activeTabIds: (number | null)[], self: WorkerCallOutcome) => void,
) {
  tabs.query({}, (queried) => {
    const seen = queried.map((tab) => ({
      id: tab.id ?? null,
      url: tab.url ?? null,
      active: tab.active ?? null,
    }));

    // The filter a fill starts with, asked separately so that what the embedder
    // calls the front view is visible next to the whole list
    tabs.query({ active: true }, (activeTabs) => {
      const activeTabIds = activeTabs.map((tab) => tab.id ?? null);

      const tabId = sender?.tab?.id;

      if (tabId === undefined) {
        answer(seen, activeTabIds, { status: "error", message: "The sender carried no tab" });

        return;
      }

      tabs.get(tabId, (tab) => {
        const lastError = runtime.lastError;

        answer(
          seen,
          activeTabIds,
          lastError
            ? { status: "error", message: lastError.message ?? "unknown" }
            : { status: "replied", reply: { id: tab?.id ?? null, url: tab?.url ?? null } },
        );
      });
    });
  });
}

/**
 * The lock broadcast's own shape: `tabs.query` for every tab, then one
 * `tabs.sendMessage` into each of them. What the asking context gets back is
 * how the send into *its* tab went, which is the outcome that says whether the
 * query listed it at all.
 */
function notifyAllTabs(
  sender: FixtureMessageSender | undefined,
  message: unknown,
  answer: (outcome: WorkerCallOutcome) => void,
) {
  const senderTabId = sender?.tab?.id;

  tabs.query({}, (queried) => {
    const targets = queried.filter((tab) => typeof tab.id === "number");

    let outcome: WorkerCallOutcome = {
      status: "error",
      message: "The worker's tabs.query did not list the sender's tab",
    };

    let remaining = targets.length;

    const finish = () => {
      remaining -= 1;

      if (remaining <= 0) {
        answer(outcome);
      }
    };

    if (targets.length === 0) {
      answer(outcome);

      return;
    }

    for (const target of targets) {
      const targetId = target.id as number;

      tabs.sendMessage(targetId, message, {}, (reply) => {
        const lastError = runtime.lastError;

        // Every tab is messaged, as a lock broadcast messages every tab; only
        // the asking context's own outcome is reported back to it
        if (targetId === senderTabId) {
          outcome = lastError
            ? { status: "error", message: lastError.message ?? "unknown" }
            : { status: "replied", reply };
        }

        finish();
      });
    }
  });
}

/**
 * The frame a message came from, as the worker's own
 * `chrome.webNavigation.getFrame` answers for it. This is the step 1Password's
 * fill hangs on — it relays an inline-menu click to the frame owning the form
 * only once `getFrame` has named that frame's parent — and every tab it asks
 * about is in another session, the worker session holding none of its own.
 */
function describeSenderFrame(
  sender: FixtureMessageSender | undefined,
  answer: (outcome: WorkerCallOutcome) => void,
) {
  const tabId = sender?.tab?.id;

  if (tabId === undefined) {
    answer({ status: "error", message: "The sender carried no tab" });

    return;
  }

  webNavigation.getFrame({ tabId, frameId: sender?.frameId ?? 0 }, (frame) => {
    answer(
      frame
        ? { status: "replied", reply: frame }
        : { status: "error", message: "getFrame answered null" },
    );
  });
}

runtime.onMessage.addListener((message, sender, sendResponse) => {
  const probeMessage = message as ProbeMessage | undefined;

  if (probeMessage?.type === "echo") {
    sendResponse({
      type: "echo-reply",
      nonce: probeMessage.nonce,
      workerInstanceId,
      sender: serializeSender(sender),
    });
  }

  if (probeMessage?.type === "read-events") {
    sendResponse({ type: "events-reply", events: [...portEvents] });
  }

  // The worker messaging the sender's own tab, and answering with how that
  // went. One of the two listeners here that answer late, so one of the two
  // that hold the channel open by returning true
  if (probeMessage?.type === "send-back") {
    sendToSender(
      sender,
      { type: "ping-from-worker", nonce: probeMessage.nonce, workerInstanceId },
      (outcome) => {
        sendResponse({ type: "send-back-reply", outcome });
      },
    );

    return true;
  }

  // What the worker's own `tabs.query` and `tabs.get` can see, which is every
  // account's tabs only because main answers both. Answers late
  if (probeMessage?.type === "query-tabs") {
    describeTabs(sender, (seen, activeTabIds, self) => {
      sendResponse({ type: "query-tabs-reply", tabs: seen, activeTabIds, self });
    });

    return true;
  }

  // And the lock broadcast's shape, which is the query and a send into every
  // tab it listed. Late as well
  if (probeMessage?.type === "notify-all-tabs") {
    notifyAllTabs(
      sender,
      { type: "ping-from-worker", nonce: probeMessage.nonce, workerInstanceId },
      (outcome) => {
        sendResponse({ type: "notify-all-tabs-reply", outcome });
      },
    );

    return true;
  }

  // The worker asking which frame of which tab it is hearing from, which
  // crosses a session every time. Answers late, so it holds the channel open
  if (probeMessage?.type === "frame-of-sender") {
    describeSenderFrame(sender, (outcome) => {
      sendResponse({ type: "frame-of-sender-reply", outcome });
    });

    return true;
  }

  /*
   * What the worker's own store holds under a key, which is how a context
   * proves a write of its own landed here rather than in the session it ran
   * in. The read is asynchronous, so this listener returns true too.
   */
  if (probeMessage?.type === "read-storage" && typeof probeMessage.key === "string") {
    const { key } = probeMessage;

    storage.local.get(key, (items) => {
      sendResponse({ type: "storage-reply", key, value: items[key] ?? null });
    });

    return true;
  }

  /*
   * A write in the worker's own session, which is the other side of the
   * `onChanged` fan-out: whoever asked for it is in a session whose own store
   * this never touches, and hearing the change there means it came over the
   * page stream. This listener answers late too.
   */
  if (probeMessage?.type === "write-storage" && typeof probeMessage.key === "string") {
    const { key, value } = probeMessage;

    storage.local.set({ [key]: value }, () => {
      sendResponse({ type: "write-storage-reply", key });
    });

    return true;
  }

  /*
   * The worker reaching the network itself, which is the one thing only it can
   * do: its requests are made in the session it runs in, where the embedder's
   * per-account blocking never applies. `no-cors` because the fixture asks for
   * no host permissions — the response is opaque either way, and what is being
   * probed is whether the request went out at all. This listener answers late.
   */
  if (probeMessage?.type === "fetch-url" && typeof probeMessage.url === "string") {
    workerGlobals.fetch(probeMessage.url, { method: "POST", mode: "no-cors", body: "{}" }).then(
      () => {
        sendResponse({ type: "fetch-url-reply", status: "ok" });
      },
      (error: unknown) => {
        sendResponse({ type: "fetch-url-reply", status: "error", message: String(error) });
      },
    );

    return true;
  }

  // And the worker opening a port to the sender's own tab
  if (probeMessage?.type === "connect-back") {
    const portName = `from-worker:${probeMessage.nonce}`;

    const tabId = sender?.tab?.id;

    if (tabId === undefined) {
      sendResponse({ type: "connect-back-reply", outcome: { status: "error", message: "No tab" } });

      return undefined;
    }

    const port = tabs.connect(tabId, { name: portName, frameId: sender?.frameId });

    port.onMessage.addListener((message) => {
      portEvents.push(`from-page:${(message as ProbeMessage | undefined)?.nonce}`);
    });

    port.onDisconnect.addListener(() => {
      portEvents.push(`disconnect:${portName}`);
    });

    port.postMessage({ type: "ping-from-worker", nonce: probeMessage.nonce, workerInstanceId });

    sendResponse({ type: "connect-back-reply", outcome: { status: "replied", reply: portName } });
  }

  // Every other answer above is synchronous, so no other listener returns true
  return undefined;
});

runtime.onConnect.addListener((port) => {
  portEvents.push(`connect:${port.name}`);

  port.onMessage.addListener((message) => {
    const probeMessage = message as ProbeMessage | undefined;

    if (probeMessage?.type === "marco") {
      port.postMessage({
        type: "polo",
        nonce: probeMessage.nonce,
        workerInstanceId,
        portName: port.name,
        sender: serializeSender(port.sender),
      });
    }

    if (probeMessage?.type === "disconnect-me") {
      port.disconnect();
    }
  });

  port.onDisconnect.addListener(() => {
    portEvents.push(`disconnect:${port.name}`);
  });
});
