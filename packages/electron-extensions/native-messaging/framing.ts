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
 */
export class NativeMessageDecoder {
  private buffered = new Uint8Array(0);

  constructor(private maxMessageBytes = MAX_NATIVE_MESSAGE_BYTES) {}

  /** Throws when the stream is unusable, which leaves the caller to end it. */
  push(chunk: Uint8Array): unknown[] {
    const combined = new Uint8Array(this.buffered.byteLength + chunk.byteLength);

    combined.set(this.buffered);

    combined.set(chunk, this.buffered.byteLength);

    this.buffered = combined;

    const messages: unknown[] = [];

    while (this.buffered.byteLength >= LENGTH_PREFIX_BYTES) {
      const messageBytes = new DataView(
        this.buffered.buffer,
        this.buffered.byteOffset,
        LENGTH_PREFIX_BYTES,
      ).getUint32(0, true);

      if (messageBytes > this.maxMessageBytes) {
        throw new Error(
          `Native message of ${messageBytes} bytes exceeds the ${this.maxMessageBytes} byte limit`,
        );
      }

      if (this.buffered.byteLength < LENGTH_PREFIX_BYTES + messageBytes) {
        break;
      }

      const body = this.buffered.subarray(LENGTH_PREFIX_BYTES, LENGTH_PREFIX_BYTES + messageBytes);

      messages.push(this.parse(body));

      this.buffered = this.buffered.slice(LENGTH_PREFIX_BYTES + messageBytes);
    }

    return messages;
  }

  private parse(body: Uint8Array) {
    try {
      return JSON.parse(textDecoder.decode(body)) as unknown;
    } catch (error) {
      throw new Error(`Native message is not valid JSON: ${String(error)}`);
    }
  }
}
