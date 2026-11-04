import { describe, expect, mock, test } from "bun:test";

let writeText: (text: string) => Promise<void> = () => Promise.resolve();

let write: (data: unknown) => Promise<void> = () => Promise.resolve();

class ClipboardItem {
  constructor(readonly items: Record<string, unknown>) {}
}

// `copyText` reads `clipboard` off the module at call time, which is what lets a
// test hand it a write that rejects. `log` goes with it because
// `electron-log/main` reaches for an Electron app that does not exist here.
mock.module("electron", () => ({
  ClipboardItem,
  clipboard: {
    write: (data: unknown) => write(data),
    writeText: (text: string) => writeText(text),
  },
}));

mock.module("./log", () => ({
  log: { error: () => {} },
}));

const { copyBookmark, copyText } = await import("./clipboard");

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

describe("copyBookmark", () => {
  test("writes the address as text and as a bookmark, and reports a write that lands", async () => {
    const written: unknown[] = [];

    write = async (data) => {
      written.push(data);
    };

    expect(await copyBookmark("Example", "https://example.com/")).toBe(true);
    expect(written).toEqual([
      [
        new ClipboardItem({
          "text/plain": "https://example.com/",
          "electron application/bookmark": { title: "Example", url: "https://example.com/" },
        }),
      ],
    ]);
  });

  test("reports a write that fails rather than throwing", async () => {
    write = () => Promise.reject(new Error("Clipboard unavailable"));

    expect(await copyBookmark("Example", "https://example.com/")).toBe(false);
  });
});
