/**
 * Chrome's native messaging wire format: a 4-byte little-endian byte length,
 * then that many bytes of UTF-8 JSON.
 *
 * The same framing carries messages twice — between Meru and the host over the
 * host's stdio, and between Meru and the extension over the bridge stream — so
 * this module stays free of Node built-ins and runs in both places.
 */

const LENGTH_PREFIX_BYTES = 4;

/** What Chrome accepts from a host; anything larger kills the connection. */
export const MAX_NATIVE_MESSAGE_BYTES = 1024 * 1024;

const textEncoder = new TextEncoder();

const textDecoder = new TextDecoder("utf-8", { fatal: true });

export function encodeNativeMessage(message: unknown): Uint8Array {
  const body = textEncoder.encode(JSON.stringify(message));

  const frame = new Uint8Array(LENGTH_PREFIX_BYTES + body.byteLength);

  new DataView(frame.buffer).setUint32(0, body.byteLength, true);

  frame.set(body, LENGTH_PREFIX_BYTES);

  return frame;
}

/**
 * Reassembles messages from however the bytes arrive. A message that claims to
 * be larger than the cap is refused before a byte of it is buffered, so a host
 * cannot grow the decoder's memory by announcing a huge length.
 *
 * The chunks are kept as they arrive and joined once, when a whole frame is in
 * hand, so every byte is copied exactly once. Growing one buffer instead copied
 * everything already held on every chunk, which is quadratic in the frame: a
 * 1 MiB message arriving in 64 KB chunks copied about 8 MB, and the runtime
 * proxy reuses this decoder under a cap of 64 MiB.
 */
export class NativeMessageDecoder {
  private chunks: Uint8Array[] = [];

  private bufferedBytes = 0;

  /** The announced body length once its prefix is read and within the cap. */
  private pendingMessageBytes: number | undefined;

  constructor(private maxMessageBytes = MAX_NATIVE_MESSAGE_BYTES) {}

  /** Throws when the stream is unusable, which leaves the caller to end it. */
  push(chunk: Uint8Array): unknown[] {
    if (chunk.byteLength > 0) {
      this.chunks.push(chunk);

      this.bufferedBytes += chunk.byteLength;
    }

    const messages: unknown[] = [];

    while (true) {
      if (this.pendingMessageBytes === undefined) {
        if (this.bufferedBytes < LENGTH_PREFIX_BYTES) {
          break;
        }

        const prefix = this.take(LENGTH_PREFIX_BYTES);

        const messageBytes = new DataView(
          prefix.buffer,
          prefix.byteOffset,
          LENGTH_PREFIX_BYTES,
        ).getUint32(0, true);

        if (messageBytes > this.maxMessageBytes) {
          throw new Error(
            `Native message of ${messageBytes} bytes exceeds the ${this.maxMessageBytes} byte limit`,
          );
        }

        this.pendingMessageBytes = messageBytes;
      }

      if (this.bufferedBytes < this.pendingMessageBytes) {
        break;
      }

      const body = this.take(this.pendingMessageBytes);

      this.pendingMessageBytes = undefined;

      messages.push(this.parse(body));
    }

    return messages;
  }

  /**
   * Takes the next `byteLength` bytes off the front of the chunks, joining only
   * as many as it takes. A chunk holding the whole run is handed over as a view
   * of itself, and one holding more keeps its remainder as a view.
   */
  private take(byteLength: number): Uint8Array {
    const firstChunk = this.chunks[0];

    if (firstChunk && firstChunk.byteLength >= byteLength) {
      if (firstChunk.byteLength === byteLength) {
        this.chunks.shift();
      } else {
        this.chunks[0] = firstChunk.subarray(byteLength);
      }

      this.bufferedBytes -= byteLength;

      return firstChunk.subarray(0, byteLength);
    }

    const taken = new Uint8Array(byteLength);

    let takenBytes = 0;

    // Never runs out, since the caller asks for no more than `bufferedBytes`
    for (let chunk = this.chunks.shift(); chunk; chunk = this.chunks.shift()) {
      const wantedBytes = byteLength - takenBytes;

      if (chunk.byteLength > wantedBytes) {
        taken.set(chunk.subarray(0, wantedBytes), takenBytes);

        this.chunks.unshift(chunk.subarray(wantedBytes));

        break;
      }

      taken.set(chunk, takenBytes);

      takenBytes += chunk.byteLength;

      if (takenBytes === byteLength) {
        break;
      }
    }

    this.bufferedBytes -= byteLength;

    return taken;
  }

  private parse(body: Uint8Array) {
    try {
      return JSON.parse(textDecoder.decode(body)) as unknown;
    } catch (error) {
      throw new Error(`Native message is not valid JSON: ${String(error)}`);
    }
  }
}
