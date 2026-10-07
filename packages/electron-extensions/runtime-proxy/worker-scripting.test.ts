import { afterEach, describe, expect, test } from "bun:test";
import { callInCallbackForm } from "../facade/lib/callback-form";
import type { ChromeNamespace } from "../facade/lib/chrome";
import { WEB_NAVIGATION_PATHS } from "../web-navigation/bridge-protocol";
import type { RuntimeProxyStaticContentScript } from "./bridge-protocol";
import {
  answerFromStaticContentScripts,
  HOST_ACCESS_ERROR,
  wrapScripting,
} from "./worker-scripting";

const PAGE_URL = "https://accounts.google.com/signin";

const FRAME_URL = "https://accounts.google.com/frame";

const OUTSIDE_URL = "https://accounts.youtube.com/check";

const frames = [
  { frameId: 0, parentFrameId: -1, url: PAGE_URL },
  { frameId: 7, parentFrameId: 0, url: FRAME_URL },
  { frameId: 9, parentFrameId: 0, url: OUTSIDE_URL },
];

const staticContentScripts: RuntimeProxyStaticContentScript[] = [
  {
    files: ["content/bootstrap.js", "content/bootstrap-lite.js"],
    matches: ["https://accounts.google.com/*"],
    excludeMatches: ["*://*/*.xml*"],
    allFrames: true,
    world: "ISOLATED",
  },
  {
    files: ["content/handler.js"],
    matches: ["https://accounts.google.com/*"],
    excludeMatches: [],
    allFrames: false,
    world: "ISOLATED",
  },
  {
    files: ["content/page-script.js"],
    matches: ["https://accounts.google.com/*"],
    excludeMatches: [],
    allFrames: true,
    world: "MAIN",
  },
];

const getFrames = async (tabId: number) => (tabId === 4 ? frames : null);

function answer(injection: Record<string, unknown>) {
  return answerFromStaticContentScripts(
    injection,
    staticContentScripts,
    getFrames as Parameters<typeof answerFromStaticContentScripts>[2],
  );
}

describe("answerFromStaticContentScripts", () => {
  test("answers a declared file as run in the frames the extension named", async () => {
    expect(await answer({ target: { tabId: 4 }, files: ["content/bootstrap.js"] })).toEqual({
      status: "ran",
      results: [{ frameId: 0, result: undefined }],
    });

    expect(
      await answer({ target: { tabId: 4, frameIds: [7] }, files: ["/content/bootstrap.js"] }),
    ).toEqual({ status: "ran", results: [{ frameId: 7, result: undefined }] });
  });

  test("answers a file the declared one stands in for", async () => {
    expect(
      await answer({ target: { tabId: 4, frameIds: [7] }, files: ["content/bootstrap-lite.js"] }),
    ).toEqual({ status: "ran", results: [{ frameId: 7, result: undefined }] });
  });

  test("answers every file only where all of them run", async () => {
    expect(
      await answer({
        target: { tabId: 4 },
        files: ["content/bootstrap.js", "content/handler.js"],
      }),
    ).toEqual({ status: "ran", results: [{ frameId: 0, result: undefined }] });

    // The handler is declared for the top frame alone
    expect(
      await answer({
        target: { tabId: 4, frameIds: [7] },
        files: ["content/bootstrap.js", "content/handler.js"],
      }),
    ).toEqual({ status: "error", message: HOST_ACCESS_ERROR });
  });

  test("keeps the frames the scripts reach for every frame of the tab", async () => {
    expect(
      await answer({ target: { tabId: 4, allFrames: true }, files: ["content/bootstrap.js"] }),
    ).toEqual({
      status: "ran",
      results: [
        { frameId: 0, result: undefined },
        { frameId: 7, result: undefined },
      ],
    });
  });

  test("refuses a frame outside the declared sites the way Chrome refuses one it may not touch", async () => {
    expect(
      await answer({ target: { tabId: 4, frameIds: [9] }, files: ["content/bootstrap.js"] }),
    ).toEqual({ status: "error", message: HOST_ACCESS_ERROR });
  });

  test("names a frame the tab does not have", async () => {
    expect(
      await answer({ target: { tabId: 4, frameIds: [12] }, files: ["content/bootstrap.js"] }),
    ).toEqual({ status: "error", message: "No frame with id 12 in tab with id 4." });
  });

  test("holds the world the file was declared in", async () => {
    expect(
      await answer({ target: { tabId: 4 }, files: ["content/page-script.js"], world: "MAIN" }),
    ).toEqual({ status: "ran", results: [{ frameId: 0, result: undefined }] });

    expect(await answer({ target: { tabId: 4 }, files: ["content/page-script.js"] })).toEqual({
      status: "unanswered",
    });

    expect(
      await answer({ target: { tabId: 4 }, files: ["content/bootstrap.js"], world: "MAIN" }),
    ).toEqual({ status: "unanswered" });
  });

  test("leaves everything it cannot speak for unanswered", async () => {
    for (const injection of [
      { target: { tabId: 4 }, files: ["content/undeclared.js"] },
      { target: { tabId: 4 }, files: ["content/bootstrap.js", "content/undeclared.js"] },
      { target: { tabId: 4 }, func: () => 1 },
      { target: { tabId: 4 }, files: [] },
      { target: { tabId: 4, documentIds: ["document"] }, files: ["content/bootstrap.js"] },
      { target: { tabId: 5 }, files: ["content/bootstrap.js"] },
      { files: ["content/bootstrap.js"] },
    ]) {
      expect(await answer(injection)).toEqual({ status: "unanswered" });
    }
  });
});

describe("wrapScripting", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function stubFrames() {
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      const { pathname } = new URL(url);

      const { details } = JSON.parse(init.body as string) as { details: { tabId: number } };

      if (pathname !== WEB_NAVIGATION_PATHS.getAllFrames) {
        return new Response(null, { status: 404 });
      }

      return Response.json(await getFrames(details.tabId));
    }) as unknown as typeof fetch;
  }

  function createExtensionApi(nativeExecuteScript: (injection: unknown) => Promise<unknown>) {
    const runtime: ChromeNamespace = {};

    const extensionApi: ChromeNamespace = {
      runtime,
      scripting: { executeScript: nativeExecuteScript },
    };

    (globalThis as unknown as { chrome?: ChromeNamespace }).chrome = extensionApi;

    wrapScripting(extensionApi, staticContentScripts);

    return {
      runtime,
      executeScript: (extensionApi.scripting as ChromeNamespace).executeScript as (
        ...callArguments: unknown[]
      ) => Promise<unknown>,
    };
  }

  afterEach(() => {
    delete (globalThis as unknown as { chrome?: ChromeNamespace }).chrome;
  });

  test("hands the call to Chromium first, and its answer back as it was", async () => {
    const { executeScript } = createExtensionApi(async () => [{ frameId: 0, result: 3 }]);

    expect(await executeScript({ target: { tabId: 4 }, files: ["content/undeclared.js"] })).toEqual(
      [{ frameId: 0, result: 3 }],
    );
  });

  test("answers an account's tab from the static content scripts", async () => {
    stubFrames();

    const { executeScript } = createExtensionApi(async () => {
      throw new Error("No tab with id: 4");
    });

    expect(await executeScript({ target: { tabId: 4 }, files: ["content/bootstrap.js"] })).toEqual([
      { frameId: 0, result: undefined },
    ]);

    await expect(
      executeScript({ target: { tabId: 4, frameIds: [9] }, files: ["content/bootstrap.js"] }),
    ).rejects.toThrow(HOST_ACCESS_ERROR);

    // Undeclared, it stays Chromium's own failure
    await expect(
      executeScript({ target: { tabId: 4 }, files: ["content/undeclared.js"] }),
    ).rejects.toThrow("No tab with id: 4");
  });

  test("passes every other failure through untouched", async () => {
    stubFrames();

    const { executeScript } = createExtensionApi(async () => {
      throw new Error("Could not load file: 'content/bootstrap.js'.");
    });

    await expect(
      executeScript({ target: { tabId: 4 }, files: ["content/bootstrap.js"] }),
    ).rejects.toThrow("Could not load file");
  });

  test("answers the callback form, with lastError for a failure", async () => {
    stubFrames();

    const { runtime, executeScript } = createExtensionApi(async () => {
      throw new Error("No tab with id: 4");
    });

    const ran = callInCallbackForm(runtime, executeScript, {
      target: { tabId: 4 },
      files: ["content/bootstrap.js"],
    });

    expect(ran.returned).toBeUndefined();

    expect(await ran.answered).toEqual([{ frameId: 0, result: undefined }]);

    const refused = callInCallbackForm(runtime, executeScript, {
      target: { tabId: 4 },
      files: ["content/undeclared.js"],
    });

    await expect(refused.answered).rejects.toThrow("No tab with id: 4");

    expect(runtime.lastError).toBeUndefined();
  });

  test("leaves a worker without scripting as it found it", () => {
    const extensionApi: ChromeNamespace = { runtime: {} };

    wrapScripting(extensionApi, staticContentScripts);

    expect(extensionApi).toEqual({ runtime: {} });
  });
});
