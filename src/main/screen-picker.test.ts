import { delay } from "es-toolkit";
import { describe, expect, it } from "vitest";

import { APPS } from "#core/apps.ts";
import type { Overlay } from "#core/overlay.ts";
import type { Platform } from "#core/platform.ts";
import type { ScreenCaptureStatus, ScreenSource } from "#core/screen-picker.ts";
import { tabKey } from "#core/tabs.ts";
import type { TabKey } from "#core/tabs.ts";
import { fakeScreenSources } from "#platform/screen-sources.fake.ts";
import type { ScreenSources } from "#platform/screen-sources.ts";
import { withheldScreenSources } from "#platform/withheld-screen-sources.ts";

import { createScreenPicker } from "./screen-picker.ts";
import type { SenderIdentity } from "./senders.ts";

const MEET = "https://meet.google.com";

const NOTES: ScreenSource = {
  id: "window:7:0",
  name: "Notes",
  thumbnail: "data:image/png;base64,",
};

const SCREEN: ScreenSource = {
  id: "screen:1:0",
  name: "Entire Screen",
  thumbnail: "data:image/png;base64,",
};

const meetTab = { profileId: "a", tabId: "meet" };
const otherMeetTab = { profileId: "a", tabId: "meet-2" };

/** Web contents ids, by what they are. */
const PAGE = 10;
const OTHER_PAGE = 11;
const CHILD = 12;
const SHELL = 1;

const setup = ({
  platform = "darwin" as Platform,
  status = "granted" as ScreenCaptureStatus,
  inWindows = [] as TabKey[],
  overlay = undefined as Overlay | undefined,
  sources = undefined as ScreenSources | undefined,
  /** Tabs whose page is not on screen: another tab is selected over it. */
  unseen = [] as TabKey[],
  /** Whether the main window is on screen, not hidden or minimized. */
  mainShown = true,
} = {}) => {
  const fake = fakeScreenSources({ status, sources: [NOTES, SCREEN] });
  const identities = new Map<number, SenderIdentity>([
    [PAGE, { role: "content-view", ...meetTab }],
    [OTHER_PAGE, { role: "content-view", ...otherMeetTab }],
    [CHILD, { role: "child-window", ...meetTab }],
    [SHELL, { role: "shell" }],
  ]);
  const pages = new Set([tabKey(meetTab), tabKey(otherMeetTab)]);
  const owned = new Set(inWindows.map(tabKey));
  const listeners = new Set<() => void>();
  let open = overlay;
  const opened: Overlay[] = [];
  const overlays = {
    current: () => open,
    hasView: () => true,
    open: (next: Overlay) => {
      open = next;
      opened.push(next);

      for (const listener of listeners) {
        listener();
      }
    },
    close: () => {
      open = undefined;

      for (const listener of listeners) {
        listener();
      }
    },
    onChange: (listener: () => void) => {
      listeners.add(listener);
    },
  };
  const logged: string[] = [];
  const picker = createScreenPicker({
    apps: APPS,
    platform,
    sources: sources ?? fake.screenSources,
    identify: (id) => identities.get(id),
    inOwnWindow: (key) => owned.has(tabKey(key)),
    pageShown: (key) => !unseen.some((tab) => tabKey(tab) === tabKey(key)),
    windowShown: (window) =>
      window === undefined ? mainShown : owned.has(tabKey(window)),
    hasPage: (key) => pages.has(tabKey(key)),
    overlays,
    log: (message) => logged.push(message),
  });
  const closedIn: TabKey[] = [];

  picker.onClosedIn((key) => closedIn.push(key));

  /** Asks as a page would, keeping every answer it gets. */
  const ask = (webContentsId: number | undefined, frameOrigin = MEET) => {
    const answers: (Pick<ScreenSource, "id" | "name"> | undefined)[] = [];

    picker.request({ webContentsId, frameOrigin }, (source) => {
      answers.push(source);
    });

    return answers;
  };

  return {
    picker,
    fake,
    ask,
    overlays,
    opened,
    closedIn,
    logged,
    drop: (key: TabKey) => pages.delete(tabKey(key)),
  };
};

const settled = () => delay(0);

describe(createScreenPicker, () => {
  it("in a run under the background flag, asks the system nothing and shows that listing failed", async () => {
    const withheld = withheldScreenSources();
    const { picker, ask, logged } = setup({
      platform: "darwin",
      sources: withheld.sources,
    });

    const answers = ask(PAGE);

    await settled();

    expect(picker.mainCard()).toStrictEqual({ kind: "failed" });
    expect(logged).toHaveLength(1);
    expect(withheld.streams.systemPicker("persist:a", true)).toBeFalsy();

    picker.cancel();

    expect(answers).toStrictEqual([undefined]);
  });

  it.each([
    ["a web contents Meru does not know", 99, MEET],
    ["no web contents", undefined, MEET],
    ["the shell", SHELL, MEET],
    ["Gmail's origin in a Meet tab", PAGE, "https://mail.google.com"],
    ["a third-party frame in Meet", PAGE, "https://www.youtube.com"],
    ["a page no app claims", PAGE, "https://example.com"],
  ])("answers %s with no stream, opening nothing", (_, id, origin) => {
    const { ask, opened, fake } = setup();

    expect(ask(id, origin)).toStrictEqual([undefined]);
    expect(opened).toStrictEqual([]);
    expect(fake.state.listed).toBe(0);
  });

  it("opens over the Meet tab's page in the main window, loading, then lists windows apart from screens", async () => {
    const { ask, picker, opened, fake } = setup();
    const answers = ask(PAGE);

    expect(opened).toStrictEqual([{ kind: "screen-picker", ...meetTab }]);
    expect(picker.mainCard()).toStrictEqual({ kind: "loading" });
    fake.settle();
    await settled();
    expect(picker.mainCard()).toStrictEqual({
      kind: "listed",
      windows: [NOTES],
      screens: [SCREEN],
    });
    expect(answers).toStrictEqual([]);
  });

  it("hands the page the source shared, once, and closes", async () => {
    const { ask, picker, overlays, fake } = setup();
    const answers = ask(PAGE);

    fake.settle();
    await settled();
    await picker.share(NOTES.id);
    picker.cancel();

    expect(answers).toStrictEqual([{ id: NOTES.id, name: NOTES.name }]);
    expect(overlays.current()).toBeUndefined();
    expect(picker.mainCard()).toBeUndefined();
  });

  it("shares nothing it did not list", async () => {
    const { ask, picker, fake } = setup();
    const answers = ask(PAGE);

    fake.settle();
    await settled();
    await picker.share("window:666:0");

    expect(answers).toStrictEqual([]);
  });

  it.each([
    ["Cancel", (picker: Picker) => picker.picker.cancel()],
    ["Escape or a press outside", (picker: Picker) => picker.overlays.close()],
    [
      "another overlay in its place",
      (picker: Picker) => picker.overlays.open({ kind: "downloads" }),
    ],
    [
      "its tab closing, sleeping or going with its profile",
      (picker: Picker) => {
        picker.drop(meetTab);
        picker.picker.follow();
      },
    ],
    [
      "its page navigating away",
      (picker: Picker) => picker.picker.navigated(meetTab),
    ],
    ["its page going", (picker: Picker) => picker.picker.dropped(PAGE)],
  ])("answers with no stream on %s", async (_, dismiss) => {
    const picker = setup();
    const answers = picker.ask(PAGE);

    picker.fake.settle();
    await settled();
    dismiss(picker);
    await picker.picker.share(NOTES.id);

    expect(answers).toStrictEqual([undefined]);
    expect(picker.picker.mainCard()).toBeUndefined();
  });

  it("keeps the picker as another tab is followed that still has its page", () => {
    const { ask, picker } = setup();
    const answers = ask(PAGE);

    picker.follow();
    picker.navigated(otherMeetTab);

    expect(answers).toStrictEqual([]);
    expect(picker.mainCard()).toStrictEqual({ kind: "loading" });
  });

  it("drops a listing that comes back after the picker was dismissed", async () => {
    const { ask, picker, fake } = setup();

    ask(PAGE);
    picker.cancel();
    fake.settle();
    await settled();

    expect(picker.mainCard()).toBeUndefined();
  });

  it("refuses a second request while one is open in the window, from the same page or another tab", () => {
    const { ask, opened } = setup();
    const first = ask(PAGE);

    expect([ask(PAGE), ask(OTHER_PAGE), ask(CHILD)]).toStrictEqual([
      [undefined],
      [undefined],
      [undefined],
    ]);
    expect(first).toStrictEqual([]);
    expect(opened).toHaveLength(1);
  });

  it("opens a request from a tab in its own window there, beside one open in the main window", () => {
    const { ask, picker, opened } = setup({ inWindows: [otherMeetTab] });

    ask(PAGE);
    ask(OTHER_PAGE);

    expect(opened).toHaveLength(1);
    expect(picker.mainCard()).toStrictEqual({ kind: "loading" });
    expect(picker.windowCard(otherMeetTab)).toStrictEqual({ kind: "loading" });
  });

  it("opens a Meet child window's request over the tab that opened it", () => {
    const { ask, picker } = setup({ inWindows: [meetTab] });

    ask(CHILD);

    expect(picker.windowCard(meetTab)).toStrictEqual({ kind: "loading" });
    expect(picker.mainCard()).toBeUndefined();
  });

  it("refuses a Meet child window's request while the tab that opened it is not the one its window shows", () => {
    const { ask, opened } = setup({ unseen: [meetTab] });

    expect([ask(CHILD), ask(PAGE)]).toStrictEqual([[undefined], [undefined]]);
    expect(opened).toStrictEqual([]);
  });

  it("refuses while the window it would show in is hidden or minimized", () => {
    const { ask, opened, picker } = setup({ mainShown: false });

    expect([ask(CHILD), ask(PAGE)]).toStrictEqual([[undefined], [undefined]]);
    expect(opened).toStrictEqual([]);
    expect(picker.mainCard()).toBeUndefined();
  });

  it("refuses rather than replace the license notice", () => {
    const { ask, opened } = setup({ overlay: { kind: "license" } });

    expect(ask(PAGE)).toStrictEqual([undefined]);
    expect(opened).toStrictEqual([]);
  });

  it("replaces another overlay, as a card does", () => {
    const { ask, opened } = setup({ overlay: { kind: "downloads" } });

    expect(ask(PAGE)).toStrictEqual([]);
    expect(opened).toStrictEqual([{ kind: "screen-picker", ...meetTab }]);
  });

  it("says in a toast that the source has gone, answering with no stream", async () => {
    const { ask, picker, fake, overlays } = setup();
    const answers = ask(PAGE);

    fake.settle();
    await settled();
    fake.state.sources = [SCREEN];
    await picker.share(NOTES.id);

    expect(answers).toStrictEqual([undefined]);
    expect(overlays.current()).toStrictEqual({
      kind: "toast",
      message: "screen-source-gone",
    });
  });

  it("says on the card in a tab's own window that the source has gone, until it is closed", async () => {
    const { ask, picker, fake, closedIn } = setup({ inWindows: [meetTab] });
    const answers = ask(PAGE);

    fake.settle();
    await settled();
    fake.state.sources = [SCREEN];
    await picker.share(NOTES.id, meetTab);

    expect(answers).toStrictEqual([undefined]);
    expect(picker.windowCard(meetTab)).toStrictEqual({ kind: "gone" });
    picker.cancel(meetTab);
    expect(picker.windowCard(meetTab)).toBeUndefined();
    expect(answers).toStrictEqual([undefined]);
    expect(closedIn).toStrictEqual([meetTab]);
  });

  it("lets a new request replace a card left saying its source had gone", async () => {
    const { ask, picker, fake } = setup({ inWindows: [meetTab] });

    ask(PAGE);
    fake.settle();
    await settled();
    fake.state.sources = [SCREEN];
    await picker.share(NOTES.id, meetTab);

    const gone = picker.windowRequest(meetTab);

    expect(ask(PAGE)).toStrictEqual([]);
    expect(picker.windowCard(meetTab)).toStrictEqual({ kind: "loading" });
    // The shell draws the new request afresh, with no tab or choice kept.
    expect(picker.windowRequest(meetTab)).not.toBe(gone);
  });

  it("closes the card in a tab's own window as the window closes, giving the keys back only when closed from within", () => {
    const { ask, picker, closedIn } = setup({ inWindows: [meetTab] });
    const answers = ask(PAGE);

    picker.closeIn(meetTab);

    expect(answers).toStrictEqual([undefined]);
    expect(closedIn).toStrictEqual([]);
  });

  it.each(["denied", "restricted"] as const)(
    "shows macOS's %s state without listing",
    (status) => {
      const { ask, picker, fake } = setup({ status });

      ask(PAGE);

      expect(picker.mainCard()).toStrictEqual({ kind: "denied" });
      expect(fake.state.listed).toBe(0);
    }
  );

  it("lists on macOS while the system has not asked yet, which has it ask", () => {
    const { ask, fake } = setup({ status: "not-determined" });

    ask(PAGE);

    expect(fake.state.listed).toBe(1);
  });

  it("lists elsewhere whatever the status says", () => {
    const { ask, picker, fake } = setup({
      platform: "win32",
      status: "denied",
    });

    ask(PAGE);

    expect(picker.mainCard()).toStrictEqual({ kind: "loading" });
    expect(fake.state.listed).toBe(1);
  });

  it("opens the system's Screen Recording settings", async () => {
    const { picker, fake } = setup({ status: "denied" });

    await picker.openSettings();

    expect(fake.state.settingsOpened).toBe(1);
  });

  it("says when listing fails, and lists again on Try again", async () => {
    const { ask, picker, fake, logged } = setup();

    ask(PAGE);
    fake.failListing();
    await settled();
    expect(picker.mainCard()).toStrictEqual({ kind: "failed" });
    expect(logged).toHaveLength(1);

    picker.retry();
    expect(picker.mainCard()).toStrictEqual({ kind: "loading" });
    fake.settle();
    await settled();
    expect(picker.mainCard()).toMatchObject({ kind: "listed" });
    expect(fake.state.listed).toBe(2);
  });

  it("lists nothing in a tab with nothing to share", async () => {
    const { ask, picker, fake } = setup();

    fake.state.sources = [];
    ask(PAGE);
    fake.settle();
    await settled();

    expect(picker.mainCard()).toStrictEqual({
      kind: "listed",
      windows: [],
      screens: [],
    });
  });
});

type Picker = ReturnType<typeof setup>;
