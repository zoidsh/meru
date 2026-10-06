import { afterEach, describe, expect, test } from "bun:test";
import { callInCallbackForm } from "./callback-form";
import type { ChromeNamespace } from "./chrome";
import { createBridgedMethod } from "./method";

const extensionGlobals = globalThis as unknown as { chrome?: ChromeNamespace };

afterEach(() => {
  delete extensionGlobals.chrome;
});

describe("createBridgedMethod", () => {
  test("answers a promise-style call with the produced result", async () => {
    const method = createBridgedMethod(async (callArguments) => ({ callArguments }));

    expect(await method("a", 1)).toEqual({ callArguments: ["a", 1] });
  });

  test("answers a callback-style call without handing it the callback", async () => {
    const method = createBridgedMethod(async (callArguments) => ({ callArguments }));

    const { promise: answered, resolve } = Promise.withResolvers<unknown>();

    expect(method("a", 1, resolve)).toBeUndefined();

    expect(await answered).toEqual({ callArguments: ["a", 1] });
  });

  test("rejects a promise-style call the way the producer did", async () => {
    const method = createBridgedMethod(async () => {
      throw new Error("bridge gone");
    });

    expect(method("a")).rejects.toThrow("bridge gone");
  });

  test("answers a callback-style call with lastError set when the producer rejects", async () => {
    const runtime: ChromeNamespace = {};

    extensionGlobals.chrome = { runtime };

    const method = createBridgedMethod(async () => {
      throw new Error("bridge gone");
    });

    const { promise: answered, resolve } = Promise.withResolvers<{
      callbackArguments: unknown[];
      lastError: unknown;
    }>();

    method("a", (...callbackArguments: unknown[]) => {
      resolve({ callbackArguments, lastError: runtime.lastError });
    });

    expect(await answered).toEqual({
      callbackArguments: [],
      lastError: { message: "bridge gone" },
    });

    // Only for the duration of the callback, as in Chrome
    expect(runtime.lastError).toBeUndefined();
  });

  test("a polyfill-shaped caller gets the rejection back", async () => {
    const runtime: ChromeNamespace = {};

    extensionGlobals.chrome = { runtime };

    const method = createBridgedMethod(async () => {
      throw new Error("bridge gone");
    });

    await expect(callInCallbackForm(runtime, method, "a").answered).rejects.toThrow("bridge gone");
  });

  test("still answers a callback in a context with no runtime", async () => {
    const method = createBridgedMethod(async () => {
      throw new Error("bridge gone");
    });

    const { promise: answered, resolve } = Promise.withResolvers<unknown[]>();

    method("a", (...callbackArguments: unknown[]) => {
      resolve(callbackArguments);
    });

    expect(await answered).toEqual([]);
  });
});
