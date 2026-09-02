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
 * Worker lifetime is deliberately not probed, here or in the tests. The
 * end-to-end suite launches through Playwright, whose CDP debugger disables
 * Chromium's MV3 idle timer, so from that suite a worker reads as
 * permanently alive whether it is or not — a test about the worker stopping
 * would pass or fail with confidence and mean nothing. That also makes
 * `workerInstanceId` and `portEvents` stable for a test's lifetime; without
 * the debugger they would reset whenever the worker idled out.
 */
import { type FixtureMessageSender, getChromeRuntime, getChromeTabs } from "./chrome";

const workerGlobals = globalThis as unknown as { crypto: { randomUUID: () => string } };

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
};

/**
 * How a call the worker made ended, in the shape the probes record their own
 * outcomes in: a reply, or the `lastError` Chrome set instead of one.
 */
type WorkerCallOutcome =
  | { status: "replied"; reply: unknown }
  | { status: "error"; message: string };

const runtime = getChromeRuntime();

const tabs = getChromeTabs();

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
  // went. The only listener here that answers late, so the only one that
  // holds the channel open by returning true
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
