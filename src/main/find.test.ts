import { describe, expect, it } from "vitest";

import { gmailTab, newProfile } from "#core/state.ts";
import type { State } from "#core/state.ts";
import type { TabKey } from "#core/tabs.ts";

import { createFind } from "./find.ts";
import { createFocus } from "./focus.ts";
import { createOverlays } from "./overlay.ts";

const mail = { profileId: "a", tabId: "gmail" };
const week = { profileId: "a", tabId: "c1" };

const initial: State = {
  version: 1,
  profiles: [
    {
      ...newProfile("a", "Default"),
      tabs: [gmailTab(), { id: "c1", app: "calendar", url: "", title: "Week" }],
    },
  ],
  selectedProfileId: "a",
};

/**
 * The find bar over the real overlays and focus, in a fake overlay view,
 * and pages that record each search and stop and answer with ids in turn.
 */
const setup = () => {
  const asked: string[] = [];
  const focused: string[] = [];
  let front: TabKey | undefined = mail;
  const withPages = new Set(["a/gmail", "a/c1"]);
  let requestId = 0;

  const focus = createFocus({
    window: { isFocused: () => true, isVisible: () => true, on: () => false },
    focusWhileInactive: false,
    resolve: (target) =>
      target.kind === "overlay"
        ? // oxlint-disable-next-line no-use-before-define -- resolved when focus moves
          overlays.focuser()
        : () => {
            focused.push(target.kind);
            focus.noteFocused(target);
          },
  });
  const overlays = createOverlays({
    focus,
    initial,
    bounds: () => ({ x: 0, y: 0, width: 400, height: 56 }),
    log: () => false,
  });

  overlays.adopt({
    webContentsId: 3,
    setBounds: () => false,
    show: () => false,
    hide: () => false,
    focus: () => {
      focused.push("overlay");
      focus.noteFocused({ kind: "overlay" });
    },
    onFocus: () => false,
    onKey: () => false,
    onGone: () => false,
    close: () => false,
  });

  const find = createFind({
    pages: {
      findable: () => front,
      hasPage: (key) => withPages.has(`${key.profileId}/${key.tabId}`),
      findInPage: (key, term, { findNext, forward }) => {
        asked.push(
          `${key.tabId} ${term} ${findNext ? "new" : "step"} ${forward ? "on" : "back"}`
        );
        requestId += 1;

        return requestId;
      },
      stopFindInPage: (key, keepSelection) => {
        asked.push(`${key.tabId} stop${keepSelection ? " kept" : ""}`);
      },
    },
    overlays,
    focus,
  });

  overlays.onChange(find.follow);

  return {
    find,
    overlays,
    asked,
    focused,
    setFront: (next: TabKey | undefined) => {
      front = next;
      find.follow();
    },
    /** Closes or sleeps the tab, which takes its page. */
    dropPage: (key: TabKey) => {
      withPages.delete(`${key.profileId}/${key.tabId}`);
      find.follow();
    },
    lastId: () => requestId,
  };
};

describe(createFind, () => {
  it("opens the bar over the front tab's page in the overlay, focused, and shows what the page finds", () => {
    const { find, overlays, asked, focused, lastId } = setup();

    find.open();
    find.type("apple");
    find.found(mail, { requestId: lastId(), ordinal: 1, matches: 3 });

    expect([
      overlays.current(),
      find.current()?.term,
      find.current()?.ordinal,
      asked,
      focused,
    ]).toStrictEqual([
      { kind: "find", ...mail },
      "apple",
      1,
      ["gmail apple new on"],
      ["overlay"],
    ]);
  });

  it("steps either way and keeps only the latest answer", () => {
    const { find, asked, lastId } = setup();

    find.open();
    find.type("apple");
    find.found(mail, { requestId: lastId(), ordinal: 1, matches: 3 });
    find.step(false);
    find.found(mail, { requestId: lastId(), ordinal: 3, matches: 3 });
    find.found(mail, { requestId: 1, ordinal: 1, matches: 3 });

    expect([asked, find.current()?.ordinal]).toStrictEqual([
      ["gmail apple new on", "gmail apple step back"],
      3,
    ]);
  });

  it("closes ending the search with the match selected and focus on the page, and goes on with the tab's term from closed", () => {
    const { find, overlays, asked, focused } = setup();

    find.open();
    find.type("apple");
    find.close();

    const closed = [overlays.current(), find.canGoOn(), [...focused]];

    find.again(true);

    expect([closed, overlays.current()?.kind, asked]).toStrictEqual([
      [undefined, true, ["overlay", "front"]],
      "find",
      ["gmail apple new on", "gmail stop kept", "gmail apple new on"],
    ]);
  });

  it("gives the field focus back when opened again while open, searching nothing", () => {
    const { find, asked, focused } = setup();

    find.open();
    find.type("apple");
    find.open();

    expect([find.current()?.opened, asked, focused]).toStrictEqual([
      2,
      ["gmail apple new on"],
      ["overlay", "overlay"],
    ]);
  });

  it("hides the bar when another tab or pane comes to the front, and shows it again on return with its term, leaving focus where it is", () => {
    const { find, overlays, asked, focused, setFront } = setup();

    find.open();
    find.type("apple");
    setFront(week);

    const away = [overlays.current(), find.current(), find.canGoOn()];
    const focusedAway = focused.length;

    setFront(mail);

    expect(away).toStrictEqual([undefined, undefined, false]);
    expect([
      overlays.current(),
      find.current()?.term,
      focused.slice(focusedAway),
      asked,
    ]).toStrictEqual([
      { kind: "find", ...mail },
      "apple",
      [],
      ["gmail apple new on"],
    ]);
  });

  it("waits under a card or a toast and shows again once it closes", () => {
    const { find, overlays } = setup();

    find.open();
    find.type("apple");
    overlays.open({ kind: "toast", message: "no-room" });

    const under = [overlays.current()?.kind, find.current()?.term];

    overlays.close();

    expect([under, overlays.current()]).toStrictEqual([
      ["toast", "apple"],
      { kind: "find", ...mail },
    ]);
  });

  it("forgets the bar and its term when the tab's page goes, closing the bar", () => {
    const { find, overlays, setFront, dropPage } = setup();

    find.open();
    find.type("apple");
    setFront(undefined);
    dropPage(mail);
    setFront(mail);

    expect([overlays.current(), find.canGoOn()]).toStrictEqual([
      undefined,
      false,
    ]);
  });

  it("searches again on a move within its page and on a new document's load, not a frame's", () => {
    const { find, asked } = setup();

    find.open();
    find.type("apple");
    find.loaded(mail);
    find.navigated(mail, true);
    find.navigated(mail, false);
    find.loaded(mail);

    expect(asked).toStrictEqual([
      "gmail apple new on",
      "gmail apple new on",
      "gmail apple new on",
    ]);
  });
});
