import { describe, expect, mock, test } from "bun:test";
import { EventEmitter } from "node:events";
import type { WebContents } from "electron";

const loggedErrors: unknown[] = [];

// `electron-log/main` reaches for an Electron app that does not exist here.
mock.module("./log", () => ({
  log: { error: (...args: unknown[]) => loggedErrors.push(args) },
}));

const openedUrls: string[] = [];

mock.module("@/url", () => ({
  openExternalUrl: (url: string) => {
    openedUrls.push(url);
  },
}));

const { keepOnRendererPage } = await import("./renderer-page");

/**
 * Stands in for a `webContents`: `commit` is Chromium committing a document,
 * which on a real one follows a load, a script's navigation or neither.
 */
function createWebContents() {
  const emitter = new EventEmitter();

  let committedUrl = "";

  const loadedUrls: string[] = [];

  const webContents = Object.assign(emitter, {
    getURL: () => committedUrl,
    loadURL: (url: string) => {
      loadedUrls.push(url);

      return Promise.resolve();
    },
    setWindowOpenHandler: () => {},
  });

  return {
    webContents: webContents as unknown as WebContents,
    loadedUrls,
    commit(url: string) {
      committedUrl = url;

      emitter.emit("did-navigate", {}, url);
    },
    willNavigate(url: string) {
      let isPrevented = false;

      emitter.emit("will-navigate", { preventDefault: () => (isPrevented = true) }, url);

      return isPrevented;
    },
  };
}

// As Node's `pathToFileURL` spells a path on a lowercase drive, and as
// Chromium commits it on Windows.
const PAGE_URL = "file:///c:/Meru/resources/app.asar/build-js/renderer/main.html?locale=en";

const COMMITTED_PAGE_URL =
  "file:///C:/Meru/resources/app.asar/build-js/renderer/main.html?locale=en";

describe("keepOnRendererPage", () => {
  test("takes the page from what its load committed, however Chromium spelled it", () => {
    const page = createWebContents();

    keepOnRendererPage(page.webContents, PAGE_URL);

    page.commit(COMMITTED_PAGE_URL);

    expect(page.loadedUrls).toEqual([]);

    expect(page.willNavigate(`${COMMITTED_PAGE_URL}#/settings`)).toBe(false);

    expect(page.willNavigate("https://example.com/")).toBe(true);
  });

  test("brings the page back from a document that committed elsewhere", () => {
    const page = createWebContents();

    keepOnRendererPage(page.webContents, PAGE_URL);

    page.commit(COMMITTED_PAGE_URL);

    page.commit("about:blank");

    expect(page.loadedUrls).toEqual([PAGE_URL]);

    page.commit(COMMITTED_PAGE_URL);

    page.commit("about:blank");

    expect(page.loadedUrls).toEqual([PAGE_URL, PAGE_URL]);
  });

  test("gives up rather than loop when bringing the page back lands elsewhere", () => {
    const page = createWebContents();

    loggedErrors.length = 0;

    keepOnRendererPage(page.webContents, PAGE_URL);

    page.commit(COMMITTED_PAGE_URL);

    page.commit("about:blank");

    page.commit("file:///elsewhere/main.html");

    expect(page.loadedUrls).toEqual([PAGE_URL]);

    expect(loggedErrors).toHaveLength(1);
  });
});
