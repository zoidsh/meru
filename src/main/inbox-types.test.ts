import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { INBOX_TYPE_EXPRESSION, PRIMARY_LABEL } from "#core/feed.ts";
import { newProfile } from "#core/state.ts";
import type { TabKey } from "#core/tabs.ts";

import { INBOX_TYPE_TIMEOUT, createInboxTypes } from "./inbox-types.ts";
import type { LoadedPage } from "./tab-views.ts";

const GMAIL = "https://mail.google.com";

const GMAIL_TAB: TabKey = { profileId: "a", tabId: "gmail" };

const setup = () => {
  const changes: string[] = [];
  const logs: string[] = [];
  const gmailTabs = new Set(["a/gmail", "b/gmail"]);
  const types = createInboxTypes({
    gmailOrigin: GMAIL,
    isGmailTab: ({ profileId, tabId }) =>
      gmailTabs.has(`${profileId}/${tabId}`),
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

  return { types, changes, logs, expressions, gmailTabs, page, answering };
};

describe(createInboxTypes, () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reads the whole inbox until a page says otherwise", () => {
    const { types } = setup();

    expect(types.label("a")).toBeUndefined();
  });

  it("reads Primary once Gmail's page says its inbox is tabbed, and tells of the change once", async () => {
    const { types, changes, expressions, answering } = setup();

    await types.loaded(GMAIL_TAB, answering("SECTIONED"));
    await types.loaded(GMAIL_TAB, answering("SECTIONED"));

    expect(types.label("a")).toBe(PRIMARY_LABEL);
    expect(types.label("b")).toBeUndefined();
    expect(changes).toStrictEqual(["a"]);
    expect(expressions).toStrictEqual([
      INBOX_TYPE_EXPRESSION,
      INBOX_TYPE_EXPRESSION,
    ]);
  });

  it.each([
    ["another type", () => Promise.resolve("PRIORITY_INBOX")],
    ["nothing", () => Promise.resolve(undefined)],
    ["an object", () => Promise.resolve({ type: "SECTIONED" })],
    ["a throw", () => Promise.reject(new Error("refused"))],
  ])("reads the whole inbox again after %s", async (_name, answer) => {
    const { types, changes, page, answering } = setup();

    await types.loaded(GMAIL_TAB, answering("SECTIONED"));
    await types.loaded(GMAIL_TAB, page(answer));

    expect(types.label("a")).toBeUndefined();
    expect(changes).toStrictEqual(["a", "a"]);
  });

  it("counts a page that does not answer in time as not tabbed", async () => {
    const { types, changes, page, answering } = setup();

    await types.loaded(GMAIL_TAB, answering("SECTIONED"));

    const never = Promise.withResolvers<unknown>().promise;
    const loading = types.loaded(
      GMAIL_TAB,
      page(() => never)
    );

    await vi.advanceTimersByTimeAsync(INBOX_TYPE_TIMEOUT);
    await loading;

    expect(types.label("a")).toBeUndefined();
    expect(changes).toStrictEqual(["a", "a"]);
  });

  it("asks only a Gmail tab's page on Gmail's origin", async () => {
    const { types, changes, expressions, answering } = setup();

    await types.loaded(
      GMAIL_TAB,
      answering("SECTIONED", "https://accounts.google.com/signin")
    );
    await types.loaded({ profileId: "a", tabId: "c1" }, answering("SECTIONED"));
    await types.loaded(GMAIL_TAB, answering("SECTIONED", "not a URL"));

    expect(expressions).toStrictEqual([]);
    expect(types.label("a")).toBeUndefined();
    expect(changes).toStrictEqual([]);
  });

  it("keeps what it read while the tab is elsewhere, as during sign-in", async () => {
    const { types, answering } = setup();

    await types.loaded(GMAIL_TAB, answering("SECTIONED"));
    await types.loaded(
      GMAIL_TAB,
      answering(undefined, "https://accounts.google.com/signin")
    );

    expect(types.label("a")).toBe(PRIMARY_LABEL);
  });

  it("keeps nothing for a profile that went while its page answered, or was removed", async () => {
    const { types, changes, gmailTabs, page, answering } = setup();
    const { promise, resolve } = Promise.withResolvers<unknown>();
    const loading = types.loaded(
      GMAIL_TAB,
      page(() => promise)
    );

    gmailTabs.delete("a/gmail");
    resolve("SECTIONED");
    await loading;

    expect(types.label("a")).toBeUndefined();

    await types.loaded(
      { profileId: "b", tabId: "gmail" },
      answering("SECTIONED")
    );
    types.follow({
      version: 1,
      profiles: [newProfile("a", "A")],
      selectedProfileId: "a",
    });

    expect(types.label("b")).toBeUndefined();
    expect(changes).toStrictEqual(["b"]);
  });
});
