import { describe, expect, test } from "bun:test";
import { createChromeFacade, installChromeFacade } from "./install";
import type { ChromeEvent, ChromeNamespace } from "./lib/chrome";

/**
 * What Electron's extension bindings hand an extension, as the spike measured
 * it: a handful of complete namespaces, `tabs` without its constants, and a
 * `webRequest` whose events are declared but never defined.
 */
function createNativeChrome(): ChromeNamespace {
  return {
    runtime: { id: "aeblfdkhhhdcdjpifhhbdiojplfjncoa", getURL: (pathname: string) => pathname },
    storage: { local: { get: () => Promise.resolve({}) } },
    tabs: { query: () => Promise.resolve([]) },
    alarms: { create: () => {}, onAlarm: { addListener: () => {} } },
    webRequest: { onBeforeRequest: undefined, onAuthRequired: undefined },
  };
}

function install() {
  const chrome = createNativeChrome();

  installChromeFacade(chrome);

  return chrome;
}

function namespaceOf(chrome: ChromeNamespace, name: string) {
  return chrome[name] as ChromeNamespace;
}

function eventOf(namespace: ChromeNamespace, name: string) {
  return namespace[name] as ChromeEvent;
}

function methodOf(namespace: ChromeNamespace, name: string) {
  return namespace[name] as (...callArguments: unknown[]) => Promise<unknown>;
}

describe("installChromeFacade", () => {
  test("leaves everything Electron implements untouched", () => {
    const chrome = createNativeChrome();

    const { runtime, storage, tabs } = chrome;

    const query = namespaceOf(chrome, "tabs").query;

    installChromeFacade(chrome);

    expect(chrome.runtime).toBe(runtime);
    expect(chrome.storage).toBe(storage);
    expect(chrome.tabs).toBe(tabs);
    expect(namespaceOf(chrome, "tabs").query).toBe(query);
  });

  test("fills the namespaces Electron is missing", () => {
    const chrome = install();

    for (const namespace of [
      "commands",
      "contextMenus",
      "notifications",
      "privacy",
      "webNavigation",
      "windows",
    ]) {
      expect(chrome[namespace]).toBeObject();
    }
  });

  test("adds the constants Electron leaves off the namespaces", () => {
    const chrome = install();

    expect(namespaceOf(chrome, "tabs").TAB_ID_NONE).toBe(-1);
    expect(namespaceOf(chrome, "tabs").TAB_INDEX_NONE).toBe(-1);
    expect(namespaceOf(chrome, "tabs").SPLIT_VIEW_ID_NONE).toBe(-1);
    expect(namespaceOf(chrome, "tabs").MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND).toBe(2);
    expect(namespaceOf(chrome, "windows").WINDOW_ID_NONE).toBe(-1);
    expect(namespaceOf(chrome, "windows").WINDOW_ID_CURRENT).toBe(-2);
  });

  test("defines the webRequest events Electron declares but never defines", () => {
    const webRequest = namespaceOf(install(), "webRequest");

    // The crash the spike hit: `"onAuthRequired" in chrome.webRequest` passes
    // and the dereference that follows takes the service worker down
    expect(eventOf(webRequest, "onAuthRequired").addListener).toBeFunction();
    expect(eventOf(webRequest, "onBeforeRedirect").addListener).toBeFunction();
    expect(eventOf(webRequest, "onBeforeRequest").addListener).toBeFunction();
  });

  test("accepts listeners on events that never fire", () => {
    const onFocusChanged = eventOf(namespaceOf(install(), "windows"), "onFocusChanged");

    let firedCount = 0;

    const listener = () => {
      firedCount += 1;
    };

    onFocusChanged.addListener(listener);

    expect(onFocusChanged.hasListener(listener)).toBe(true);
    expect(onFocusChanged.hasListeners()).toBe(true);

    onFocusChanged.removeListener(listener);

    expect(onFocusChanged.hasListener(listener)).toBe(false);
    expect(firedCount).toBe(0);
  });

  test("answers a promise call with a window of the right shape", async () => {
    const windows = namespaceOf(install(), "windows");

    const currentWindow = (await methodOf(windows, "getCurrent")({ populate: true })) as Record<
      string,
      unknown
    >;

    expect(currentWindow.id).toBeNumber();
    expect(currentWindow.id).not.toBe(-1);
    expect(currentWindow.focused).toBe(true);
    expect(currentWindow.tabs).toEqual([]);
  });

  test("answers a callback call instead of returning a promise", async () => {
    const windows = namespaceOf(install(), "windows");

    const { promise, resolve } = Promise.withResolvers<unknown>();

    const returnValue = methodOf(windows, "getAll")({}, resolve);

    expect(returnValue).toBeUndefined();
    expect(await promise).toBeArrayOfSize(1);
  });

  test("hands out context menu ids the way Chrome does", () => {
    const contextMenus = namespaceOf(install(), "contextMenus");

    const create = contextMenus.create as (properties: unknown) => unknown;

    expect(create({ id: "unlock", title: "Unlock" })).toBe("unlock");
    expect(create({ title: "Fill" })).toBeNumber();
  });

  test("reports privacy settings as out of the extension's reach", async () => {
    const services = namespaceOf(namespaceOf(install(), "privacy"), "services");

    const passwordSavingEnabled = namespaceOf(services, "passwordSavingEnabled");

    expect(await methodOf(passwordSavingEnabled, "set")({ value: true })).toBeUndefined();
    expect(await methodOf(passwordSavingEnabled, "get")({})).toEqual({
      value: false,
      levelOfControl: "not_controllable",
    });
  });

  test("serves the deprecated privacy settings Chrome still ships", async () => {
    const services = namespaceOf(namespaceOf(install(), "privacy"), "services");

    // Deprecated since Chrome 70 and still in the API, so an extension reaching
    // for the old key must find a setting rather than dereference `undefined`
    const autofillEnabled = namespaceOf(services, "autofillEnabled");

    expect(await methodOf(autofillEnabled, "get")({})).toEqual({
      value: false,
      levelOfControl: "not_controllable",
    });
    expect(await methodOf(autofillEnabled, "set")({ value: true })).toBeUndefined();
    expect(await methodOf(autofillEnabled, "clear")({})).toBeUndefined();
    expect(eventOf(autofillEnabled, "onChange").addListener).toBeFunction();
  });

  test("shares one facade between the chrome and browser globals", () => {
    const facade = createChromeFacade();

    const chrome = createNativeChrome();
    const browser = createNativeChrome();

    installChromeFacade(chrome, facade);
    installChromeFacade(browser, facade);

    const listener = () => {};

    eventOf(namespaceOf(browser, "windows"), "onFocusChanged").addListener(listener);

    expect(eventOf(namespaceOf(chrome, "windows"), "onFocusChanged").hasListener(listener)).toBe(
      true,
    );
  });

  test("takes over the alarms Electron half implements", () => {
    const chrome = createNativeChrome();

    const { alarms } = chrome;

    installChromeFacade(chrome);

    // Electron schedules these and delivers `onAlarm` to no service worker,
    // which is a gap filling cannot reach — see `api/alarms.ts`
    expect(chrome.alarms).not.toBe(alarms);
    expect(namespaceOf(chrome, "alarms").getAll).toBeFunction();
  });

  test("shares one alarms between the chrome and browser globals", () => {
    const facade = createChromeFacade();

    const chrome = createNativeChrome();
    const browser = createNativeChrome();

    installChromeFacade(chrome, facade);
    installChromeFacade(browser, facade);

    // One namespace means one set of `onAlarm` listeners and one parked stream,
    // whichever global the extension reached it through
    expect(chrome.alarms).toBe(browser.alarms);
  });

  test("runs twice without replacing what the first run added", () => {
    const chrome = install();

    const { windows } = chrome;

    installChromeFacade(chrome);

    expect(chrome.windows).toBe(windows);
  });
});
