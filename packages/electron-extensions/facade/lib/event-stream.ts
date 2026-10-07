import { NativeMessageDecoder } from "../../native-messaging/framing";
import { postBridge } from "./bridge";

/** How long a dropped events stream waits before it is parked again. */
const RETRY_DELAY_MS = 1000;

function delay(delayMs: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

/**
 * Parks a streaming response at a bridge path and hands every frame main writes
 * to it to `onFrame`, for as long as the context lives — which is how main
 * delivers an event to a context that asked for nothing, Electron dispatching
 * none of Chrome's events to a service worker.
 *
 * A stream that ends is parked again behind a delay, since a torn-down session
 * and a refused request both look like an ending from here, and the context is
 * still live and still holds listeners. The frames are length-prefixed JSON, in
 * native messaging's framing (`native-messaging/framing.ts`).
 *
 * Returns a function that starts it, once however often it is called, so the
 * first listener can park the stream and a context that never listens never
 * opens one. Its `stop` lets the stream go again, for an event whose parked
 * stream costs main something while nothing listens.
 */
export function createEventStream<Frame>(
  pathName: string,
  onFrame: (frame: Frame) => void,
  { label }: { label: string },
) {
  let isListening = false;

  // Bumped by each stop, so a loop still waiting out its retry delay after a
  // stop and a restart knows it is no longer the current one
  let generation = 0;

  let abortController: AbortController | undefined;

  const readStream = async (signal: AbortSignal) => {
    const response = await postBridge(pathName, {}, undefined, signal);

    if (!response.ok || !response.body) {
      throw new Error(`The ${label} bridge answered ${response.status}`);
    }

    const reader = response.body.getReader();

    const decoder = new NativeMessageDecoder();

    // A frame the decoder refuses throws out of the loop, and a reader left
    // open then means main keeps this stream in its delivery set and writes to
    // it forever while the retry parks another one
    try {
      for (;;) {
        const { value, done } = await reader.read();

        if (done) {
          return;
        }

        for (const frame of decoder.push(value) as Frame[]) {
          onFrame(frame);
        }
      }
    } finally {
      await reader.cancel().catch(() => undefined);
    }
  };

  const start = async () => {
    if (isListening) {
      return;
    }

    isListening = true;

    const startedGeneration = generation;

    while (generation === startedGeneration) {
      abortController = new AbortController();

      try {
        await readStream(abortController.signal);
      } catch (error) {
        if (generation === startedGeneration) {
          console.error(`[chrome-facade] ${label} stream failed`, error);
        }
      }

      if (generation !== startedGeneration) {
        return;
      }

      await delay(RETRY_DELAY_MS);
    }
  };

  const stop = () => {
    if (!isListening) {
      return;
    }

    isListening = false;

    generation += 1;

    abortController?.abort();

    abortController = undefined;
  };

  return Object.assign(start, { stop });
}
