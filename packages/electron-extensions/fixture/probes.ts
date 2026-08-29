/**
 * The probes every fixture context runs against the worker, identical in a
 * content script and in an extension page. Each probe records an outcome
 * rather than throwing, so one broken path still leaves the others' results
 * to read — the tests assert on the whole outcome objects.
 */
import { type FixturePort, type FixtureRuntime, getChromeRuntime } from "./chrome";

/** Long enough for a relay wake, far under the test runner's own timeouts. */
const PROBE_TIMEOUT_MS = 15_000;

const EVENT_POLL_INTERVAL_MS = 250;

export type EchoOutcome =
  | { status: "replied"; reply: unknown }
  | { status: "error"; message: string };

export type PortOutcome =
  | { status: "replied"; reply: unknown }
  | { status: "disconnected" }
  | { status: "timeout" };

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
};

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

export async function runProbes(): Promise<ProbeResults> {
  const runtime = getChromeRuntime();

  const contextGlobals = globalThis as unknown as {
    crypto: { randomUUID: () => string };
    location: { href: string };
  };

  const contextId = contextGlobals.crypto.randomUUID();

  const manifest = runtime.getManifest?.();

  return {
    contextId,
    documentUrl: contextGlobals.location.href,
    extensionId: runtime.id,
    manifestHasBackground: manifest ? manifest.background !== undefined : null,
    echo: await sendMessage(runtime, { type: "echo", nonce: `echo:${contextId}` }),
    port: await probePort(runtime, contextId),
    workerClosedPort: await probeWorkerClosedPort(runtime, contextId),
    selfCloseSeenByWorker: await probeSelfClose(runtime, contextId),
  };
}
