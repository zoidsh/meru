import { describe, expect, test } from "bun:test";
import { encodeNativeMessage, MAX_NATIVE_MESSAGE_BYTES, NativeMessageDecoder } from "./framing";

function decodeAll(chunks: Uint8Array[], maxMessageBytes?: number) {
  const decoder = new NativeMessageDecoder(maxMessageBytes);

  return chunks.flatMap((chunk) => decoder.push(chunk));
}

describe("encodeNativeMessage", () => {
  test("puts the byte length in front, little-endian", () => {
    const frame = encodeNativeMessage({ a: 1 });

    expect(new DataView(frame.buffer).getUint32(0, true)).toBe(frame.byteLength - 4);
    expect(Array.from(frame.subarray(0, 4))).toEqual([7, 0, 0, 0]);
    expect(new TextDecoder().decode(frame.subarray(4))).toBe('{"a":1}');
  });

  test("counts bytes rather than characters", () => {
    const frame = encodeNativeMessage("é");

    expect(new DataView(frame.buffer).getUint32(0, true)).toBe(4);
  });
});

describe("NativeMessageDecoder", () => {
  test("reads several messages out of one chunk", () => {
    const chunk = new Uint8Array([
      ...encodeNativeMessage({ first: true }),
      ...encodeNativeMessage({ second: true }),
    ]);

    expect(decodeAll([chunk])).toEqual([{ first: true }, { second: true }]);
  });

  test("waits for a message split across chunks", () => {
    const frame = encodeNativeMessage({ split: "yes" });

    const decoder = new NativeMessageDecoder();

    expect(decoder.push(frame.subarray(0, 2))).toEqual([]);
    expect(decoder.push(frame.subarray(2, 9))).toEqual([]);
    expect(decoder.push(frame.subarray(9))).toEqual([{ split: "yes" }]);
  });

  test("keeps what is left of a chunk for the next message", () => {
    const frame = encodeNativeMessage({ n: 1 });

    const decoder = new NativeMessageDecoder();

    expect(
      decoder.push(new Uint8Array([...frame, ...encodeNativeMessage({ n: 2 }).subarray(0, 3)])),
    ).toEqual([{ n: 1 }]);

    expect(decoder.push(encodeNativeMessage({ n: 2 }).subarray(3))).toEqual([{ n: 2 }]);
  });

  test("refuses a message larger than the cap before buffering it", () => {
    const announcement = new Uint8Array(4);

    new DataView(announcement.buffer).setUint32(0, MAX_NATIVE_MESSAGE_BYTES + 1, true);

    expect(() => decodeAll([announcement])).toThrow(
      `Native message of ${MAX_NATIVE_MESSAGE_BYTES + 1} bytes exceeds the ${MAX_NATIVE_MESSAGE_BYTES} byte limit`,
    );
  });

  test("accepts a message right at the cap", () => {
    const message = "a".repeat(MAX_NATIVE_MESSAGE_BYTES - 2);

    expect(decodeAll([encodeNativeMessage(message)])).toEqual([message]);
  });

  test("throws on a message that is not JSON", () => {
    const body = new TextEncoder().encode("not json");

    const frame = new Uint8Array(4 + body.byteLength);

    new DataView(frame.buffer).setUint32(0, body.byteLength, true);

    frame.set(body, 4);

    expect(() => decodeAll([frame])).toThrow(/not valid JSON/);
  });
});
