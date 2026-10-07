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
 * opens one.
 */
export function createEventStream<Frame>(
  pathName: string,
  onFrame: (frame: Frame) => void,
  { label }: { label: string },
) {
  let isListening = false;

  const readStream = async () => {
    const response = await postBridge(pathName, {});

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

  return async () => {
    if (isListening) {
      return;
    }

    isListening = true;

    for (;;) {
      try {
        await readStream();
      } catch (error) {
        console.error(`[chrome-facade] ${label} stream failed`, error);
      }

      await delay(RETRY_DELAY_MS);
    }
  };
}
