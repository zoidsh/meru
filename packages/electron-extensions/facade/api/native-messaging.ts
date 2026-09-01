import {
  NATIVE_MESSAGING_PATHS,
  type NativeMessagingFrame,
} from "../../native-messaging/bridge-protocol";
import { NativeMessageDecoder } from "../../native-messaging/framing";
import { postBridge } from "../lib/bridge";
import type { ChromeNamespace } from "../lib/chrome";
import { createEvent } from "../lib/event";
import { getLastErrorMessage, withLastError } from "../lib/last-error";

const DISCONNECTED_PORT_ERROR = "Attempting to use a disconnected port object";

const BRIDGE_CLOSED_ERROR = "The native messaging bridge closed the connection.";

type NativeMessagingPort = {
  name: string;
  postMessage: (message: unknown) => void;
  disconnect: () => void;
  onMessage: ReturnType<typeof createEvent>;
  onDisconnect: ReturnType<typeof createEvent>;
};

function createPort(runtime: ChromeNamespace, hostName: string): NativeMessagingPort {
  const portId = crypto.randomUUID();

  const onMessage = createEvent();

  const onDisconnect = createEvent();

  let isDisconnected = false;

  let markOpened = () => {};

  /**
   * Resolves once the bridge has answered the connect request, which is when the
   * port id arrives. Extensions post the moment `connectNative` returns, and
   * two fetches have no order between them, so everything sent waits here and
   * then goes out in the order it was written.
   */
  const opened = new Promise<void>((resolve) => {
    markOpened = resolve;
  });

  let sendChain: Promise<unknown> = opened;

  let cancelFrames = async () => {};

  const port: NativeMessagingPort = {
    name: hostName,
    onMessage,
    onDisconnect,
    postMessage(message) {
      if (isDisconnected) {
        throw new Error(DISCONNECTED_PORT_ERROR);
      }

      sendChain = sendChain
        .then(() => postBridge(NATIVE_MESSAGING_PATHS.post, { portId, message }))
        .catch(() => undefined);
    },
    disconnect() {
      if (isDisconnected) {
        return;
      }

      isDisconnected = true;

      // Chrome delivers a port's traffic in order, so the disconnect goes out
      // behind the connect and everything already posted. Sent unchained it
      // overtakes them, and main closes the port before the messages arrive
      sendChain = sendChain
        .then(() => postBridge(NATIVE_MESSAGING_PATHS.disconnect, { portId }))
        .catch(() => undefined)
        // Main's stream cancel handler closes the port too, which is the
        // backstop for a disconnect request that never landed
        .then(() => cancelFrames())
        .catch(() => undefined);
    },
  };

  // Chrome stays quiet about a port the extension disconnected itself
  const disconnected = (error?: string) => {
    markOpened();

    if (isDisconnected) {
      return;
    }

    isDisconnected = true;

    withLastError(runtime, error, () => {
      onDisconnect.emit(port);
    });
  };

  const readFrames = async () => {
    const response = await postBridge(NATIVE_MESSAGING_PATHS.connect, { portId, hostName });

    if (!response.ok || !response.body) {
      throw new Error(`The native messaging bridge answered ${response.status}`);
    }

    markOpened();

    const reader = response.body.getReader();

    cancelFrames = () => reader.cancel();

    const decoder = new NativeMessageDecoder();

    for (;;) {
      const { value, done } = await reader.read();

      if (done) {
        return;
      }

      for (const frame of decoder.push(value) as NativeMessagingFrame[]) {
        // A port the extension disconnected hears nothing more, even while the
        // host's last messages are still on their way. The reader is left
        // open here because `disconnect` cancels it behind its own request
        if (isDisconnected) {
          return;
        }

        if (frame.type === "message") {
          onMessage.emit(frame.message, port);
        } else {
          disconnected(frame.error);

          return;
        }
      }
    }
  };

  readFrames().then(
    () => {
      disconnected(BRIDGE_CLOSED_ERROR);
    },
    (error: unknown) => {
      disconnected(error instanceof Error ? error.message : String(error));
    },
  );

  return port;
}

function createSendNativeMessage(runtime: ChromeNamespace) {
  return (hostName: string, message: unknown, ...callArguments: unknown[]) => {
    const callback = callArguments.at(-1);

    const reply = new Promise<unknown>((resolve, reject) => {
      const port = createPort(runtime, hostName);

      port.onMessage.addListener((response) => {
        resolve(response);

        port.disconnect();
      });

      port.onDisconnect.addListener(() => {
        reject(new Error(getLastErrorMessage(runtime) ?? BRIDGE_CLOSED_ERROR));
      });

      port.postMessage(message);
    });

    if (typeof callback !== "function") {
      return reply;
    }

    reply.then(
      (response) => {
        (callback as (response: unknown) => void)(response);
      },
      (error: Error) => {
        withLastError(runtime, error.message, () => {
          (callback as (response: unknown) => void)(undefined);
        });
      },
    );

    return undefined;
  };
}

/**
 * Replaces Electron's `connectNative` and `sendNativeMessage` rather than
 * filling in around them: both exist, and both refuse every host. Electron's
 * `ElectronMessagingDelegate` answers `DISALLOW` to any host name and hands out
 * no receiver, which is what turns 1Password's search for its desktop app into
 * "Access to the native messaging host was disabled by the system
 * administrator". The replacements reach the package's own bridge instead.
 */
export function installNativeMessaging(extensionApi: ChromeNamespace) {
  const runtime = extensionApi.runtime as ChromeNamespace | undefined;

  if (!runtime) {
    return;
  }

  runtime.connectNative = (hostName: string) => createPort(runtime, hostName);

  runtime.sendNativeMessage = createSendNativeMessage(runtime);
}
