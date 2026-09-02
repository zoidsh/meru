/**
 * The probes every fixture context runs against the worker, identical in a
 * content script and in an extension page. Each probe records an outcome
 * rather than throwing, so one broken path still leaves the others' results
 * to read — the tests assert on the whole outcome objects.
 */
import {
  type FixtureMessageSender,
  type FixturePort,
  type FixtureRuntime,
  getChromeRuntime,
} from "./chrome";

/** Long enough for a relay wake, far under the test runner's own timeouts. */
const PROBE_TIMEOUT_MS = 15_000;

const EVENT_POLL_INTERVAL_MS = 250;

const ARRIVAL_POLL_INTERVAL_MS = 25;

export type EchoOutcome =
  | { status: "replied"; reply: unknown }
  | { status: "error"; message: string };

export type PortOutcome =
  | { status: "replied"; reply: unknown }
  | { status: "disconnected" }
  | { status: "timeout" };

/** The `MessageSender` a shimmed context sees, flattened to compare on. */
export type SeenSender = {
  id: string | null;
  origin: string | null;
  hasTab: boolean;
};

/**
 * A round trip the worker started, which is the direction nothing but
 * `tabs.sendMessage` and `tabs.connect` carry: what this context heard, and
 * what the worker's own call reported back about it.
 */
export type WorkerInitiatedOutcome = {
  heard: unknown | null;
  sender: SeenSender | null;
  outcome: EchoOutcome;
};

export type ProbeResults = {
  /** Minted per context, so every port name and nonce names its context. */
  contextId: string;
  documentUrl: string;
  extensionId: string;
  /**
   * Whether this context's copy of the extension still carries a `background`
   * key: `true` is the full copy, `false` the content-script-only one, and
   * `null` a context where `getManifest` does not exist.
   */
  manifestHasBackground: boolean | null;
  echo: EchoOutcome;
  port: PortOutcome;
  /** Whether this context saw its port die after asking the worker to close it. */
  workerClosedPort: boolean;
  /** Whether the worker's event log recorded this context closing its own port. */
  selfCloseSeenByWorker: boolean;
  /**
   * The name of a port this context opened and deliberately left open, or
   * `null` if it never came up. Nothing in this context will ever close it, so
   * the worker hearing it disconnect means the context itself went away.
   */
  openPortName: string | null;
  /** The worker messaging this context's own tab with `tabs.sendMessage`. */
  workerSentBack: WorkerInitiatedOutcome;
  /** The worker opening a port to this context's own tab with `tabs.connect`. */
  workerConnectedBack: WorkerInitiatedOutcome;
};

function seeSender(sender: FixtureMessageSender | undefined): SeenSender {
  return {
    id: sender?.id ?? null,
    origin: sender?.origin ?? null,
    hasTab: sender?.tab !== undefined,
  };
}

function delay(durationMs: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, durationMs);
  });
}

function sendMessage(runtime: FixtureRuntime, message: unknown): Promise<EchoOutcome> {
  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    try {
      timer = setTimeout(() => {
        resolve({ status: "error", message: "The reply never arrived" });
      }, PROBE_TIMEOUT_MS);

      runtime.sendMessage(message, (reply) => {
        clearTimeout(timer);

        const lastError = runtime.lastError;

        resolve(
          lastError
            ? { status: "error", message: lastError.message ?? "unknown" }
            : { status: "replied", reply },
        );
      });
    } catch (error) {
      clearTimeout(timer);

      resolve({ status: "error", message: String(error) });
    }
  });
}

/** Connects, says marco, resolves on the first thing that comes back. */
function probePort(runtime: FixtureRuntime, contextId: string): Promise<PortOutcome> {
  return new Promise((resolve) => {
    const port = runtime.connect({ name: `marco:${contextId}` });

    let isSettled = false;

    const settle = (outcome: PortOutcome) => {
      if (isSettled) {
        return;
      }

      isSettled = true;

      clearTimeout(timer);

      resolve(outcome);
    };

    const timer = setTimeout(() => {
      settle({ status: "timeout" });
    }, PROBE_TIMEOUT_MS);

    port.onMessage.addListener((message) => {
      settle({ status: "replied", reply: message });

      port.disconnect();
    });

    port.onDisconnect.addListener(() => {
      settle({ status: "disconnected" });
    });

    port.postMessage({ type: "marco", nonce: `marco:${contextId}` });
  });
}

/**
 * A marco round trip on the port, so that what follows is known to happen on
 * a live, listened-to port: a port that dies instantly — no listener, no
 * relay — resolves false here rather than letting its disconnect pass for
 * the one a later probe asked for.
 */
function portRoundTrip(port: FixturePort, contextId: string): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve(false);
    }, PROBE_TIMEOUT_MS);

    port.onMessage.addListener(() => {
      clearTimeout(timer);

      resolve(true);
    });

    port.onDisconnect.addListener(() => {
      clearTimeout(timer);

      resolve(false);
    });

    port.postMessage({ type: "marco", nonce: `round-trip:${contextId}` });
  });
}

/** Asks the worker to close the port, and reports whether this end saw it die. */
async function probeWorkerClosedPort(runtime: FixtureRuntime, contextId: string): Promise<boolean> {
  const port = runtime.connect({ name: `worker-closes:${contextId}` });

  if (!(await portRoundTrip(port, contextId))) {
    return false;
  }

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve(false);
    }, PROBE_TIMEOUT_MS);

    port.onDisconnect.addListener(() => {
      clearTimeout(timer);

      resolve(true);
    });

    port.postMessage({ type: "disconnect-me" });
  });
}

/**
 * Whether a port this context closes is a disconnect the worker's `onConnect`
 * port sees. A round trip on the port first, so the close cannot outrun the
 * connect it is closing; then the worker's event log is polled, because the
 * closing side has nothing local left to observe.
 */
async function probeSelfClose(runtime: FixtureRuntime, contextId: string): Promise<boolean> {
  const portName = `self-closes:${contextId}`;

  const port = runtime.connect({ name: portName });

  if (!(await portRoundTrip(port, contextId))) {
    return false;
  }

  port.disconnect();

  const deadline = Date.now() + PROBE_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const outcome = await sendMessage(runtime, { type: "read-events" });

    if (
      outcome.status === "replied" &&
      ((outcome.reply as { events?: string[] }).events ?? []).includes(`disconnect:${portName}`)
    ) {
      return true;
    }

    await delay(EVENT_POLL_INTERVAL_MS);
  }

  return false;
}

/**
 * Opens a port, proves it is live, and leaves it open — what a page that
 * navigates away without disconnecting leaves behind. Its name goes into the
 * results so a test can watch the worker's log for the disconnect that the
 * context going away should produce.
 */
async function probeOpenPort(runtime: FixtureRuntime, contextId: string): Promise<string | null> {
  const portName = `left-open:${contextId}`;

  const port = runtime.connect({ name: portName });

  return (await portRoundTrip(port, contextId)) ? portName : null;
}

/**
 * A round trip the worker starts. This context asks for one, and then waits
 * for what the worker sends into its tab — a `tabs.sendMessage` or a
 * `tabs.connect`, both of which have to cross sessions to arrive. What the
 * worker reports is recorded next to what actually turned up, so a message
 * the worker believed it delivered and the page never saw is visible as the
 * two disagreeing.
 */
function probeWorkerInitiated(
  runtime: FixtureRuntime,
  contextId: string,
  requestType: "send-back" | "connect-back",
  arrivals: Map<string, { message: unknown; sender: SeenSender }>,
): Promise<WorkerInitiatedOutcome> {
  const nonce = `${requestType}:${contextId}`;

  return new Promise((resolve) => {
    void sendMessage(runtime, { type: requestType, nonce }).then(async (askOutcome) => {
      // The worker answers with how its own call went, wrapped in the reply to
      // the asking. A context with no tab of its own — a top-level extension
      // page, which is what an action popup is — is one the worker cannot send
      // into at all, and hearing that saves waiting out the timeout
      const workerOutcome =
        askOutcome.status === "replied"
          ? ((askOutcome.reply as { outcome?: EchoOutcome } | undefined)?.outcome ?? {
              status: "error",
              message: "The worker answered without an outcome",
            })
          : askOutcome;

      const deadline = Date.now() + (workerOutcome.status === "replied" ? PROBE_TIMEOUT_MS : 0);

      while (Date.now() < deadline && !arrivals.has(nonce)) {
        await delay(ARRIVAL_POLL_INTERVAL_MS);
      }

      const arrival = arrivals.get(nonce);

      resolve({
        heard: arrival?.message ?? null,
        sender: arrival?.sender ?? null,
        outcome: workerOutcome,
      });
    });
  });
}

export async function runProbes(): Promise<ProbeResults> {
  const runtime = getChromeRuntime();

  const contextGlobals = globalThis as unknown as {
    crypto: { randomUUID: () => string };
    location: { href: string };
  };

  const contextId = contextGlobals.crypto.randomUUID();

  const manifest = runtime.getManifest?.();

  /*
   * Registered before anything is asked of the worker, since what the worker
   * sends back arrives on these. In a content-script-only session nothing
   * native ever dispatches to them: everything here came over the shim's
   * parked page stream.
   */
  const arrivals = new Map<string, { message: unknown; sender: SeenSender }>();

  runtime.onMessage.addListener((message, sender, sendResponse) => {
    const probeMessage = message as { type?: string; nonce?: string } | undefined;

    if (probeMessage?.type !== "ping-from-worker" || typeof probeMessage.nonce !== "string") {
      return undefined;
    }

    arrivals.set(probeMessage.nonce, { message, sender: seeSender(sender) });

    sendResponse({ type: "pong", nonce: probeMessage.nonce, contextId });

    return undefined;
  });

  runtime.onConnect.addListener((port) => {
    port.onMessage.addListener((message) => {
      const probeMessage = message as { type?: string; nonce?: string } | undefined;

      if (probeMessage?.type !== "ping-from-worker" || typeof probeMessage.nonce !== "string") {
        return;
      }

      arrivals.set(probeMessage.nonce, { message, sender: seeSender(port.sender) });

      port.postMessage({ type: "pong", nonce: probeMessage.nonce, contextId });
    });
  });

  return {
    contextId,
    documentUrl: contextGlobals.location.href,
    extensionId: runtime.id,
    manifestHasBackground: manifest ? manifest.background !== undefined : null,
    echo: await sendMessage(runtime, { type: "echo", nonce: `echo:${contextId}` }),
    port: await probePort(runtime, contextId),
    workerClosedPort: await probeWorkerClosedPort(runtime, contextId),
    selfCloseSeenByWorker: await probeSelfClose(runtime, contextId),
    openPortName: await probeOpenPort(runtime, contextId),
    workerSentBack: await probeWorkerInitiated(runtime, contextId, "send-back", arrivals),
    workerConnectedBack: await probeWorkerInitiated(runtime, contextId, "connect-back", arrivals),
  };
}
