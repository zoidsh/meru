import { afterEach, expect, test } from "bun:test";
import { removeBrowserGlobal } from "./browser-global";

const contextGlobals = globalThis as unknown as Record<string, unknown>;

afterEach(() => {
  delete contextGlobals.chrome;

  delete contextGlobals.browser;
});

test("removes browser where chrome belongs to an extension", () => {
  contextGlobals.chrome = { runtime: { id: "aeblfdkhhhdcdjpifhhbdiojplfjncoa" } };

  contextGlobals.browser = {};

  removeBrowserGlobal();

  expect("browser" in contextGlobals).toBe(false);
});

test("leaves a web page's own browser alone in the main world", () => {
  // A page's main world has Chromium's `chrome` without an extension's runtime
  contextGlobals.chrome = { loadTimes: () => undefined };

  const pageBrowser = { ownedBy: "page" };

  contextGlobals.browser = pageBrowser;

  removeBrowserGlobal();

  expect(contextGlobals.browser).toBe(pageBrowser);
});
