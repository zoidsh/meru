import { afterEach, expect, test } from "bun:test";
import type { ChromeNamespace } from "./lib/chrome";

const contextGlobals = globalThis as unknown as Record<string, unknown>;

afterEach(() => {
  delete contextGlobals.chrome;

  delete contextGlobals.browser;
});

test("takes away the browser global and fills chrome alone", async () => {
  const chrome: ChromeNamespace = { runtime: { id: "aeblfdkhhhdcdjpifhhbdiojplfjncoa" } };

  const browser: ChromeNamespace = { runtime: { id: "aeblfdkhhhdcdjpifhhbdiojplfjncoa" } };

  contextGlobals.chrome = chrome;

  contextGlobals.browser = browser;

  await import("./index");

  expect("browser" in contextGlobals).toBe(false);

  expect(chrome.windows).toBeDefined();

  expect(browser.windows).toBeUndefined();
});
