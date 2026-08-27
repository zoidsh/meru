import { describe, expect, test } from "bun:test";
import type { NavigationEntry, RestoreOptions, WebContents } from "electron";
import { loadUrlOrRestoreNavigationHistory, restoreNavigationHistory } from "./load-url";

function makeWebContents(restore: (options: RestoreOptions) => Promise<void>) {
  return {
    navigationHistory: { restore },
  } as unknown as WebContents;
}

function makeLoadableWebContents({
  restore,
  loadURL,
  destroyed = false,
  currentUrl = "",
}: {
  restore: (options: RestoreOptions) => Promise<void>;
  loadURL: (url: string) => Promise<void>;
  destroyed?: boolean;
  currentUrl?: string;
}) {
  return {
    navigationHistory: { restore },
    loadURL,
    isDestroyed: () => destroyed,
    getURL: () => currentUrl,
  } as unknown as WebContents;
}

function neverRestores(): Promise<void> {
  throw new Error("Should not restore");
}

const url = "https://calendar.google.com/";

function rejects() {
  return Promise.reject(new Error("ERR_NAME_NOT_RESOLVED"));
}

const entries: NavigationEntry[] = [
  { url: "https://mail.google.com/", title: "Inbox", pageState: "state-0" },
  { url: "https://calendar.google.com/", title: "Calendar", pageState: "state-1" },
];

describe("restoreNavigationHistory", () => {
  test("hands the entries and the active index to the view", async () => {
    let restoredOptions: RestoreOptions | undefined;

    const restored = await restoreNavigationHistory(
      makeWebContents(async (options) => {
        restoredOptions = options;
      }),
      { entries, index: 1 },
    );

    expect(restored).toBe(true);
    expect(restoredOptions).toEqual({ entries, index: 1 });
  });

  test("answers false instead of rejecting when the page fails to load", async () => {
    const restored = await restoreNavigationHistory(
      makeWebContents(() => Promise.reject(new Error("ERR_NAME_NOT_RESOLVED"))),
      { entries, index: 1 },
    );

    expect(restored).toBe(false);
  });
});

describe("loadUrlOrRestoreNavigationHistory", () => {
  test("loads the URL outright when the tab has no history to come back to", async () => {
    const loadedUrls: string[] = [];

    const loaded = await loadUrlOrRestoreNavigationHistory(
      makeLoadableWebContents({
        restore: neverRestores,
        loadURL: async (requestedUrl) => {
          loadedUrls.push(requestedUrl);
        },
      }),
      url,
    );

    expect(loaded).toBe(true);
    expect(loadedUrls).toEqual([url]);
  });

  test("leaves the URL alone when the history restores", async () => {
    const loadedUrls: string[] = [];

    const loaded = await loadUrlOrRestoreNavigationHistory(
      makeLoadableWebContents({
        restore: async () => {},
        loadURL: async (requestedUrl) => {
          loadedUrls.push(requestedUrl);
        },
      }),
      url,
      { entries, index: 1 },
    );

    expect(loaded).toBe(true);
    expect(loadedUrls).toEqual([]);
  });

  test("falls back to the URL when the history fails to restore", async () => {
    const loadedUrls: string[] = [];

    const loaded = await loadUrlOrRestoreNavigationHistory(
      makeLoadableWebContents({
        restore: rejects,
        loadURL: async (requestedUrl) => {
          loadedUrls.push(requestedUrl);
        },
      }),
      url,
      { entries, index: 1 },
    );

    expect(loaded).toBe(true);
    expect(loadedUrls).toEqual([url]);
  });

  test("answers false rather than rejecting when the fallback fails too", async () => {
    const loaded = await loadUrlOrRestoreNavigationHistory(
      makeLoadableWebContents({ restore: rejects, loadURL: rejects }),
      url,
      { entries, index: 1 },
    );

    expect(loaded).toBe(false);
  });

  test("leaves a view destroyed mid-restore alone", async () => {
    const loadedUrls: string[] = [];

    const loaded = await loadUrlOrRestoreNavigationHistory(
      makeLoadableWebContents({
        restore: rejects,
        loadURL: async (requestedUrl) => {
          loadedUrls.push(requestedUrl);
        },
        destroyed: true,
      }),
      url,
      { entries, index: 1 },
    );

    expect(loaded).toBe(false);
    expect(loadedUrls).toEqual([]);
  });

  test("loads the URL when the tab hibernated before its first load committed", async () => {
    const loadedUrls: string[] = [];

    // A view that never committed answers `{ entries: [], index: -1 }`, which
    // is not an index `restore` accepts.
    const loaded = await loadUrlOrRestoreNavigationHistory(
      makeLoadableWebContents({
        restore: neverRestores,
        loadURL: async (requestedUrl) => {
          loadedUrls.push(requestedUrl);
        },
      }),
      url,
      { entries: [], index: -1 },
    );

    expect(loaded).toBe(true);
    expect(loadedUrls).toEqual([url]);
  });

  test("leaves a restore that was superseded rather than failed alone", async () => {
    const loadedUrls: string[] = [];

    // Chromium aborts the entry being restored when another navigation takes
    // over, which rejects the restore on a view that is showing a page.
    const loaded = await loadUrlOrRestoreNavigationHistory(
      makeLoadableWebContents({
        restore: rejects,
        loadURL: async (requestedUrl) => {
          loadedUrls.push(requestedUrl);
        },
        currentUrl: "https://calendar.google.com/r/day",
      }),
      url,
      { entries, index: 1 },
    );

    expect(loaded).toBe(true);
    expect(loadedUrls).toEqual([]);
  });
});
