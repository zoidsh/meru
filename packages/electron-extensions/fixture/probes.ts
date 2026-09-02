/**
 * The probes every fixture context runs against the worker, identical in a
 * content script and in an extension page. Each probe records an outcome
 * rather than throwing, so one broken path still leaves the others' results
 * to read — the tests assert on the whole outcome objects.
 */
import {
  type FixtureManifest,
  type FixtureMessageSender,
  type FixturePort,
  type FixtureRuntime,
  type FixtureStorageArea,
  getChromeRuntime,
  getChromeStorage,
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

export type StorageOutcome =
  | { status: "read"; value: unknown }
  | { status: "error"; message: string };

export type ProbeResults = {
  /** Minted per context, so every port name and nonce names its context. */
  contextId: string;
  documentUrl: string;
  extensionId: string;
  /**
   * Whole, what this context's `chrome.runtime.getManifest()` answers, and
   * `null` in a context that has no such method. Every session has to answer
   * the same manifest even though they load different copies: the
   * content-script-only copy is derived without a `background` key, and the
   * shim is what puts the worker copy's manifest back in front of the
   * extension.
   */
  manifest: FixtureManifest | null;
  echo: EchoOutcome;
  port: PortOutcome;
  /**
   * The worker's stamp as this context's `chrome.storage.local` answers for
   * it. A content-script-only session has no worker and nothing that ever
   * writes its own store, so reading the stamp back means the call was
   * relayed to the session that keeps the one store.
   */
  workerStampInLocal: StorageOutcome;
  /**
   * The same stamp in `session`, which Chrome closes to content scripts by
   * default and leaves open to the extension's own documents. Both halves are
   * asserted, because the proxy answering in a privileged context could
   * otherwise hand every content script a store Chrome would not have.
   */
  workerStampInSession: StorageOutcome;
  /**
   * What the worker's own store holds under a key this context wrote, read
   * back through the worker rather than locally: a write that landed in this
   * session's store would read back as `null` here.
   */
  writeSeenByWorker: StorageOutcome;
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
  /**
   * Whether the worker's event log recorded this context answering on the port
   * the worker opened — the page-to-worker half of a worker-opened port, which
   * nothing this side can observe.
   */
  portReplySeenByWorker: boolean;
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

/**
 * Whether the worker heard this context's answer on the port it opened. The
 * answering side has nothing local to observe, so the worker's own event log is
 * polled the way `probeSelfClose` polls it.
 */
async function probePortReplySeenByWorker(
  runtime: FixtureRuntime,
  contextId: string,
): Promise<boolean> {
  const deadline = Date.now() + PROBE_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const outcome = await sendMessage(runtime, { type: "read-events" });

    if (
      outcome.status === "replied" &&
      ((outcome.reply as { events?: string[] }).events ?? []).includes(
        `from-page:connect-back:${contextId}`,
      )
    ) {
      return true;
    }

    await delay(EVENT_POLL_INTERVAL_MS);
  }

  return false;
}

/** One storage read, recording a refusal as the outcome it is. */
function readStorage(
  runtime: FixtureRuntime,
  area: FixtureStorageArea,
  key: string,
): Promise<StorageOutcome> {
  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    try {
      timer = setTimeout(() => {
        resolve({ status: "error", message: "The read never answered" });
      }, PROBE_TIMEOUT_MS);

      area.get(key, (items) => {
        clearTimeout(timer);

        const lastError = runtime.lastError;

        resolve(
          lastError
            ? { status: "error", message: lastError.message ?? "unknown" }
            : { status: "read", value: items[key] ?? null },
        );
      });
    } catch (error) {
      clearTimeout(timer);

      resolve({ status: "error", message: String(error) });
    }
  });
}

/**
 * Writes a key of this context's own and asks the worker what its store holds
 * under it. The worker reads its own `chrome.storage` natively, so a write
 * that stayed in this session would come back `null`.
 */
async function probeWriteSeenByWorker(
  runtime: FixtureRuntime,
  area: FixtureStorageArea,
  contextId: string,
): Promise<StorageOutcome> {
  const key = `probe:${contextId}`;

  const written = await new Promise<StorageOutcome | undefined>((resolve) => {
    const timer = setTimeout(() => {
      resolve({ status: "error", message: "The write never answered" });
    }, PROBE_TIMEOUT_MS);

    try {
      area.set({ [key]: contextId }, () => {
        clearTimeout(timer);

        const lastError = runtime.lastError;

        resolve(
          lastError ? { status: "error", message: lastError.message ?? "unknown" } : undefined,
        );
      });
    } catch (error) {
      clearTimeout(timer);

      resolve({ status: "error", message: String(error) });
    }
  });

  if (written) {
    return written;
  }

  const outcome = await sendMessage(runtime, { type: "read-storage", key });

  return outcome.status === "replied"
    ? { status: "read", value: (outcome.reply as { value?: unknown }).value ?? null }
    : { status: "error", message: outcome.message };
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

  /*
   * Sequential and named rather than awaited inside the object, because the
   * last of them is conditional on the one before it: a context the worker had
   * no tab to reach has no reply for the worker to have heard, and polling its
   * event log for one would wait out the timeout for nothing.
   */
  const echo = await sendMessage(runtime, { type: "echo", nonce: `echo:${contextId}` });

  const storage = getChromeStorage();

  const workerStampInLocal = await readStorage(runtime, storage.local, "workerStamp");

  const workerStampInSession = await readStorage(runtime, storage.session, "workerSessionStamp");

  const writeSeenByWorker = await probeWriteSeenByWorker(runtime, storage.local, contextId);

  const port = await probePort(runtime, contextId);

  const workerClosedPort = await probeWorkerClosedPort(runtime, contextId);

  const selfCloseSeenByWorker = await probeSelfClose(runtime, contextId);

  const openPortName = await probeOpenPort(runtime, contextId);

  const workerSentBack = await probeWorkerInitiated(runtime, contextId, "send-back", arrivals);

  const workerConnectedBack = await probeWorkerInitiated(
    runtime,
    contextId,
    "connect-back",
    arrivals,
  );

  return {
    contextId,
    documentUrl: contextGlobals.location.href,
    extensionId: runtime.id,
    manifest: manifest ?? null,
    echo,
    port,
    workerStampInLocal,
    workerStampInSession,
    writeSeenByWorker,
    workerClosedPort,
    selfCloseSeenByWorker,
    openPortName,
    workerSentBack,
    workerConnectedBack,
    portReplySeenByWorker:
      workerConnectedBack.heard !== null && (await probePortReplySeenByWorker(runtime, contextId)),
  };
}
