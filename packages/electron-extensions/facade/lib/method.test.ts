import { describe, expect, test } from "bun:test";
import { createBridgedMethod } from "./method";

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

  test("answers a callback-style call with undefined when the producer rejects", async () => {
    const method = createBridgedMethod(async () => {
      throw new Error("bridge gone");
    });

    const { promise: answered, resolve } = Promise.withResolvers<unknown>();

    void method("a", resolve);

    expect(await answered).toBeUndefined();
  });
});
