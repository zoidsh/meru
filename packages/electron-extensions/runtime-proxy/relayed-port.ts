import { createEvent } from "../facade/lib/event";
import { RECEIVING_END_ERROR, type RuntimeProxySender } from "./bridge-protocol";

const DISCONNECTED_PORT_ERROR = "Attempting to use a disconnected port object";

/**
 * Where a port's messages go once its far end is known. A relayed port's is the
 * bridge; a `tabs.connect` that turned out to name a tab of the worker's own
 * session gets one wrapping the native port Chromium opened instead.
 */
export type RelayedPortTransport = {
  /** Throws with the message the port should disconnect with when refused. */
  post: (message: unknown) => Promise<void> | void;
  disconnect: () => Promise<void> | void;
};

export type CreateRelayedPortOptions = {
  name: string;
  /** Chrome leaves `sender` unset on the side that opened the port. */
  sender?: RuntimeProxySender;
  /**
   * Opens the far end. Posts chain behind it, so a message can never overtake
   * the connect that made somewhere for it to land, and a rejection is a port
   * that never opened — exactly what a missing receiving end looks like.
   */
  open: () => Promise<RelayedPortTransport>;
  /** `lastError` around an emit, on every runtime object this side wrapped. */
  withRuntimesLastError: (error: string, emit: () => void) => void;
  /** Called once the port is closed, whichever side closed it. */
  onClosed: () => void;
};

export type RelayedPort = {
  /** The `chrome.runtime.Port` the extension is handed. */
  externalPort: Record<string, unknown>;
  emitMessage: (message: unknown) => void;
  /** The far end hung up: the extension's listeners hear it, nothing is sent. */
  emitDisconnect: (error?: string) => void;
};

/**
 * A `chrome.runtime.Port` whose far end is somewhere this context cannot reach
 * directly — the one worker from a shimmed page, or a shimmed page from the
 * worker. Both sides of the proxy hand out the same object, since Chrome's port
 * contract does not care which of them opened it: messages arrive in the order
 * they were posted, `disconnect` is quiet when this side calls it and carries
 * `lastError` when the port went away, and a post after either throws.
 */
export function createRelayedPort({
  name,
  sender,
  open,
  withRuntimesLastError,
  onClosed,
}: CreateRelayedPortOptions): RelayedPort {
  const onMessage = createEvent();

  const onDisconnect = createEvent();

  let isDisconnected = false;

  const opened = open();

  // Chained so two posts arrive in the order they were written, behind the
  // open. Sent unchained they overtake it, and the far end has no port yet.
  // The chain itself never rejects: a failed send is settled where it happens
  let sendChain: Promise<void> = opened.then(
    () => undefined,
    () => undefined,
  );

  const externalPort: Record<string, unknown> = {
    name,
    onMessage,
    onDisconnect,
    postMessage(message: unknown) {
      if (isDisconnected) {
        throw new Error(DISCONNECTED_PORT_ERROR);
      }

      sendChain = sendChain
        .then(() => opened)
        .then((transport) => transport.post(message))
        .then(
          () => undefined,
          (error: Error) => {
            // A post the bridge refused, which is what a session at its cap of
            // bodies read at once gets. Chrome has no answer for one message
            // being refused, so this takes the nearest one it has: the port
            // goes away with `lastError` set and later posts throw
            finish({ tellFarEnd: true, emit: true, error: error.message });
          },
        );
    },
    disconnect() {
      // Chrome stays quiet about a port this side closed itself
      finish({ tellFarEnd: true, emit: false });
    },
  };

  if (sender) {
    externalPort.sender = sender;
  }

  /**
   * Ends the port, once. `tellFarEnd` is for the ends this side decided, which
   * the other side has to be told about; the disconnect rides `sendChain` like
   * every post, so it lands behind what was written before it rather than
   * closing the far end's record while those messages are still on their way.
   */
  const finish = ({
    tellFarEnd,
    emit,
    error,
  }: {
    tellFarEnd: boolean;
    emit: boolean;
    error?: string;
  }) => {
    if (isDisconnected) {
      return;
    }

    isDisconnected = true;

    onClosed();

    if (tellFarEnd) {
      sendChain = sendChain
        .then(() => opened)
        .then((transport) => transport.disconnect())
        .then(
          () => undefined,
          () => undefined,
        );
    }

    if (!emit) {
      return;
    }

    if (error === undefined) {
      onDisconnect.emit(externalPort);

      return;
    }

    withRuntimesLastError(error, () => {
      onDisconnect.emit(externalPort);
    });
  };

  // A port that never opened is a receiving end that does not exist, which the
  // extension hears about the same way Chrome tells it
  void opened.catch(() => {
    finish({ tellFarEnd: false, emit: true, error: RECEIVING_END_ERROR });
  });

  return {
    externalPort,
    emitMessage(message: unknown) {
      if (!isDisconnected) {
        onMessage.emit(message, externalPort);
      }
    },
    emitDisconnect(error?: string) {
      finish({ tellFarEnd: false, emit: true, error });
    },
  };
}
