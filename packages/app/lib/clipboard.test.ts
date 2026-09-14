import { describe, expect, mock, test } from "bun:test";

let writeText: (text: string) => Promise<void> = () => Promise.resolve();

// `copyText` reads `clipboard` off the module at call time, which is what lets a
// test hand it a write that rejects. `log` goes with it because
// `electron-log/main` reaches for an Electron app that does not exist here.
mock.module("electron", () => ({
  clipboard: {
    writeText: (text: string) => writeText(text),
  },
}));

mock.module("./log", () => ({
  log: { error: () => {} },
}));

const { copyText } = await import("./clipboard");

describe("copyText", () => {
  test("reports a write that lands", async () => {
    const written: string[] = [];

    writeText = async (text) => {
      written.push(text);
    };

    expect(await copyText("123456")).toBe(true);
    expect(written).toEqual(["123456"]);
  });

  test("reports a write that fails rather than throwing", async () => {
    writeText = () => Promise.reject(new Error("Clipboard unavailable"));

    expect(await copyText("123456")).toBe(false);
  });
});
