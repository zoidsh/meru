import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { INBOX_TYPE_EXPRESSION } from "#core/feed.ts";
import type { TabKey } from "#core/tabs.ts";

import { INBOX_TYPE_TIMEOUT, createInboxTypes } from "./inbox-types.ts";
import type { LoadedPage } from "./tab-views.ts";

const GMAIL = "https://mail.google.com";

const GMAIL_TAB: TabKey = { profileId: "a", tabId: "gmail" };

const setup = ({ failSave = false }: { failSave?: boolean } = {}) => {
  const changes: string[] = [];
  const logs: string[] = [];
  const saves: [string, boolean][] = [];
  const gmailTabs = new Set(["a/gmail", "b/gmail"]);
  const tabbed = new Map<string, boolean>();
  const types = createInboxTypes({
    gmailOrigin: GMAIL,
    isGmailTab: ({ profileId, tabId }) =>
      gmailTabs.has(`${profileId}/${tabId}`),
    isTabbed: (profileId) => tabbed.get(profileId) ?? false,
    setTabbed: (profileId, value) => {
      saves.push([profileId, value]);

      if (failSave) {
        return Promise.reject(new Error("disk full"));
      }

      // As the profiles do, nothing is written for a profile that went.
      if (!gmailTabs.has(`${profileId}/gmail`)) {
        return Promise.resolve(false);
      }

      tabbed.set(profileId, value);

      return Promise.resolve(true);
    },
    onChange: (profileId) => changes.push(profileId),
    log: (message) => logs.push(message),
  });
  const expressions: string[] = [];

  const page = (
    answer: () => Promise<unknown>,
    url = `${GMAIL}/mail/u/0/#inbox`
  ): LoadedPage => ({
    url: () => url,
    evaluate: (expression) => {
      expressions.push(expression);

      return answer();
    },
  });
  const answering = (value: unknown, url?: string) =>
    page(() => Promise.resolve(value), url);

  return {
    types,
    changes,
    logs,
    saves,
    tabbed,
    expressions,
    gmailTabs,
    page,
    answering,
  };
};

describe(createInboxTypes, () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("saves a tabbed inbox once Gmail's page says so, and tells of the change once", async () => {
    const { types, changes, saves, tabbed, expressions, answering } = setup();

    await types.loaded(GMAIL_TAB, answering("SECTIONED"));
    await types.loaded(GMAIL_TAB, answering("SECTIONED"));

    expect(tabbed.get("a")).toBeTruthy();
    expect(saves).toStrictEqual([["a", true]]);
    expect(changes).toStrictEqual(["a"]);
    expect(expressions).toStrictEqual([
      INBOX_TYPE_EXPRESSION,
      INBOX_TYPE_EXPRESSION,
    ]);
  });

  it("saves the whole inbox again when the page names another type", async () => {
    const { types, changes, tabbed, answering } = setup();

    await types.loaded(GMAIL_TAB, answering("SECTIONED"));
    await types.loaded(GMAIL_TAB, answering("PRIORITY_INBOX"));

    expect(tabbed.get("a")).toBeFalsy();
    expect(changes).toStrictEqual(["a", "a"]);
  });

  it.each([
    ["nothing", () => Promise.resolve(undefined)],
    ["an object", () => Promise.resolve({ type: "SECTIONED" })],
    ["a number", () => Promise.resolve(1)],
    ["a throw", () => Promise.reject(new Error("refused"))],
  ])(
    "keeps what it knew when the page answers %s, as an error page or another of Gmail's apps does",
    async (_name, answer) => {
      const { types, changes, saves, tabbed, page, answering } = setup();

      await types.loaded(GMAIL_TAB, answering("SECTIONED"));
      await types.loaded(GMAIL_TAB, page(answer));

      expect(tabbed.get("a")).toBeTruthy();
      expect(saves).toHaveLength(1);
      expect(changes).toStrictEqual(["a"]);
    }
  );

  it("keeps what it knew when a busy page does not answer in time", async () => {
    const { types, changes, tabbed, page, answering } = setup();

    await types.loaded(GMAIL_TAB, answering("SECTIONED"));

    const never = Promise.withResolvers<unknown>().promise;
    const loading = types.loaded(
      GMAIL_TAB,
      page(() => never)
    );

    await vi.advanceTimersByTimeAsync(INBOX_TYPE_TIMEOUT);
    await loading;

    expect(tabbed.get("a")).toBeTruthy();
    expect(changes).toStrictEqual(["a"]);
  });

  it("asks only a Gmail tab's page on Gmail's origin", async () => {
    const { types, changes, saves, expressions, answering } = setup();

    await types.loaded(
      GMAIL_TAB,
      answering("SECTIONED", "https://accounts.google.com/signin")
    );
    await types.loaded({ profileId: "a", tabId: "c1" }, answering("SECTIONED"));
    await types.loaded(GMAIL_TAB, answering("SECTIONED", "not a URL"));

    expect(expressions).toStrictEqual([]);
    expect(saves).toStrictEqual([]);
    expect(changes).toStrictEqual([]);
  });

  it("tells nothing for a profile that went while its page answered", async () => {
    const { types, changes, logs, gmailTabs, page } = setup();
    const { promise, resolve } = Promise.withResolvers<unknown>();
    const loading = types.loaded(
      GMAIL_TAB,
      page(() => promise)
    );

    gmailTabs.delete("a/gmail");
    resolve("SECTIONED");
    await loading;

    expect(changes).toStrictEqual([]);
    expect(logs).toStrictEqual([]);
  });

  it("logs a save that fails and tells of no change", async () => {
    const { types, changes, logs, answering } = setup({ failSave: true });

    await types.loaded(GMAIL_TAB, answering("SECTIONED"));

    expect(changes).toStrictEqual([]);
    expect(logs).toStrictEqual([
      "The inbox type of profile a was not saved: disk full",
    ]);
  });
});
